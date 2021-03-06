/*!
 * rxweb is a component oriented web templating framework around rxjs.
 *
 * Copyright (C) 2021  Markus Peröbner
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the
 * License, or (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <https:www.gnu.org/licenses/>.
 */

/*
 * The main entry point is define(…) which is used to define rxweb
 * components.
 */

import { combineLatest, forkJoin, of, Subject, Observable, merge as merge2 } from 'rxjs';
import { map, merge, mergeMap, tap, distinctUntilChanged } from 'rxjs/operators';
import * as jsep from 'jsep';

jsep.addUnaryOp('*');

let eventJointNames = [
    'click',
    'load',
    'submit',
];

let eventJointNamesSet = new Set(eventJointNames);

/**
 * jointFactories defines possible rxweb joints and their execution
 * order.
 */
let jointFactories = [
    ['if', IfJoint],
    ['for', ForJoint],
    ['text-content', ElementPropertyJoint],
    ['class-name', ElementPropertyJoint],
    ['transclude', TranscludeJoint],
].concat(eventJointNames.map(name => [name, EventListenerJoint]));

let jointFactoryByName = new Map(jointFactories);

let jointPriorityByName = new Map(jointFactories.map((f, i) => [f[0], i]));

/**
 * defines a rxweb component.
 *
 * The bind callback is provided with the component's context. The
 * context contains Observables which provide events. Events may
 * be either caused from within the component. For example click
 * handlers within the component's template. Events can also be
 * provided from components wrapping this component using
 * rxweb-put-* attributes. The bind callback may return an object
 * which provides Observables to be used within the component's
 * template.
 */
export function define(name, bind){
    customElements.define(name, class extends HTMLElement {
        constructor(){
            super();
            this.transclusionChildren = Array.from(this.childNodes);
            empty(this);
            this.template = getTemplate(name).content.cloneNode(true);
            if(!this.rxweb){
                this.rxweb = {};
            }
            let eventSubjects = new Map();
            let getValues = this.rxweb.get || {};
            for(let [name, subject] of Object.entries(getValues)){
                eventSubjects.set(name, subject);
            }
            addEventSubjects(eventSubjects, this.template);
            let events = Object.fromEntries(Array.from(eventSubjects).map(([name, subject]) => [name, subject.asObservable()]));
            let putValues = this.rxweb.put || {};
            let outputs = bind(Object.assign({}, putValues, events)) || {};
            let linkObservable = linkSubjectsToObservables(getValues, outputs);
            let rootContext = Object.assign({}, putValues, events, outputs);
            this.componentObservable = merge2(rootContext._ || of(), linkObservable);
            this.componentSubscription = null;
            this.rootJoints = [];
            // publish events and outputs to be used in
            // transclusions.
            this.rxweb.events = events;
            this.rxweb.context = rootContext;
            appendChildJoints(this, this.rootJoints, this.template, rootContext, eventSubjects);
        }

        connectedCallback(){
            this.appendChild(this.template);
            for(let j of this.rootJoints){
                j.on();
            }
            if(!this.componentSubscription){
                this.componentSubscription = this.componentObservable.subscribe();
            }
        }

        disconnectedCallback(){
            if(this.componentSubscription){
                this.componentSubscription.unsubscribe();
                this.componentSubscription = null;
            }
            for(let j of this.rootJoints){
                j.off();
            }
            empty(this);
        }
    });
}

function appendChildJoints(component, joints, parent, context, events){
    // Array.from(…) copies the nodes before the
    // appendJoints(…) call might modify the template
    // elements and break the iteration here.
    for(let element of Array.from(parent.children)){
        appendJoints(component, joints, element, context, events);
    }
}

/**
 * appendJoints searches for the first layer of dynamic elements in
 * the template element.
 */
function appendJoints(component, joints, element, context, events){
    // TODO find a good name for these "joints" we look for in this function and rename the name of the function
    let jointAttributes = Array.from(element.getAttributeNames())
        .filter(name => name.startsWith('rxweb-'))
        .map(name => name.substring('rxweb-'.length));
    if(jointAttributes.length === 0){
        appendChildJoints(component, joints, element, context, events);
        return;
    }
    jointAttributes.sort((l, r) => {
        let lp = getJointPriority(l);
        let rp = getJointPriority(r);
        if(lp < rp){
            return -1;
        }
        if(rp < lp){
            return 1;
        }
        return 0;
    });
    let jointAttributesLen = jointAttributes.length;
    for(let i = 0; i < jointAttributesLen; ++i){
        let jointName = jointAttributes[i];
        if(jointName.startsWith('get-')){
            let producerExpression = element.getAttribute(`rxweb-${jointName}`);
            let [producerName, producerArgs] = parseProducerExpression(producerExpression);
            let remoteName = camelCase(jointName.substring('get-'.length));
            let elementContext = getRxwebElementContext();
            elementContext.get[remoteName] = events.get(producerName);
        } else if(jointName.startsWith('put-')){
            let localName = element.getAttribute(`rxweb-${jointName}`);
            let remoteName = camelCase(jointName.substring('put-'.length));
            let elementContext = getRxwebElementContext();
            elementContext.put[remoteName] = context[localName];
        } else {
            let jointFactory = jointName.startsWith('style-') ? StylePropertyJoint : jointFactoryByName.get(jointName);
            if(!jointFactory){
                throw new Error(`Found unknown rxweb-${jointName} attribute.`);
            }
            let joint = new jointFactory(component, element, context, events, jointName);
            joints.push(joint);
            if(jointFactory.terminal && i < jointAttributesLen-1){
                // for the sake of rxweb simplicity the
                // combination of terminal joints and regular
                // joints is not allowed. this avoids having to
                // treat other joints on the element with the
                // terminal joint as child joints. for example the
                // terminal rxweb-if joint would need to turn the
                // rxweb-text-content joint on and off like a
                // child joint.
                throw new Error(`rxweb-${jointName} together with rxweb-${jointAttributes[i+1]} is not allowed on one element.`);
            }
        }
    }

    function getRxwebElementContext(){
        if(!element.rxweb){
            element.rxweb = {};
        }
        if(!element.rxweb.get){
            element.rxweb.get = {};
        }
        if(!element.rxweb.put){
            element.rxweb.put = {};
        }
        return element.rxweb;
    }
}

function getJointPriority(jointName){
    if(jointName.startsWith('get-') || jointName.startsWith('set-')){
        return -1;
    }
    return jointPriorityByName.get(jointName);
}

function addEventSubjects(subjects, element){
    for(let child of element.children){
        for(let attributeName of child.getAttributeNames()){
            if(!attributeName.startsWith('rxweb-')){
                continue;
            }
            let jointName = attributeName.substring('rxweb-'.length);
            if(eventJointNamesSet.has(jointName) || jointName.startsWith('get-')){
                let producerExpression = child.getAttribute(attributeName);
                let [producerName, producerArgs] = parseProducerExpression(producerExpression);
                if(subjects.has(producerName)){
                    continue;
                }
                subjects.set(producerName, new Subject());
            }
        }
        addEventSubjects(subjects, child);
    }
    
    for(let eventName of eventJointNames){
        let eventAttribute = `rxweb-${eventName}`;
        for(let producer of element.querySelectorAll(`*[${eventAttribute}]`)){
            let producerExpression = producer.getAttribute(eventAttribute);
            let [producerName, producerArgs] = parseProducerExpression(producerExpression);
            if(subjects.has(producerName)){
                continue;
            }
            subjects.set(producerName, new Subject());
        }            
    }
}

function linkSubjectsToObservables(subjects, observables){
    let matching = [];
    for(let name of Object.keys(subjects)){
        if(!observables.hasOwnProperty(name)){
            continue;
        }
        matching.push([
            subjects[name],
            observables[name],
        ]);
    }
    if(matching.length === 0){
        return of();
    }
    return Observable.create(observer => {
        let subscriptions = matching
            .map(([subject, observable]) => {
                observable.subscribe(x => subject.next(x),
                                     e => subject.error(e),
                                     () => subject.complete());
            });
        return () => {
            for(let subscription of subscriptions){
                subscription.unsubscribe();
            }
        };
    });
}

function getTemplate(name){
    let template = document.querySelector(`template[rxweb-component=${name}]`);
    if(!template){
        throw new Error(`Template element with attribute rxweb-component=${name} not found in DOM.`);
    }
    return template;
}

function parseProducerExpression(expression){
    let ast = jsep(expression);
    if(ast.type !== 'CallExpression'){
        throw new Error(`Producer expression must be a call expression: ${expression}`);
    }
    let name = ast.callee.name;
    let args = ast.arguments;
    return [name, args];
}

function IfJoint(component, element, context, events){
    this.hook = addHookBefore(element);
    this.element = element;
    this.rootJoints = [];
    this.removeElement();
    appendChildJoints(component, this.rootJoints, element, context, events);
    let ifExpression = element.getAttribute('rxweb-if');
    this.observable = evaluateObservableExpression(jsep(ifExpression), context)
        .pipe(
            map(v => !!v),
            distinctUntilChanged(),
            tap(showElement => {
                if(showElement){
                    this.addElement();
                    for(let j of this.rootJoints){
                        j.on();
                    }
                } else {
                    for(let j of this.rootJoints){
                        j.off();
                    }
                    this.removeElement();
                }
            })
        );
    this.subscription = null;
}

IfJoint.terminal = true;

IfJoint.prototype.addElement = function(){
    this.hook.parentNode.insertBefore(this.element, this.hook);
};

IfJoint.prototype.removeElement = function(){
    let parent = this.element.parentNode;
    if(parent){
        parent.removeChild(this.element);
    }
};

function evaluateObservableExpression(ast, context){
    let identifierIndex = new Map();
    let identifierObservables = [];
    collectIdentifiers(ast);
    return combineLatest(identifierObservables)
        .pipe(mergeMap(identifierValues => {
            return evaluateAst(ast, identifierValues);
        }));

    function collectIdentifiers(ast){
        switch(ast.type){
        default:
            throw new Error(`Unknown type: ${ast.type}`);
        case 'BinaryExpression':
        case 'LogicalExpression':
            collectIdentifiers(ast.left);
            collectIdentifiers(ast.right);
            break;
        case 'Identifier':
            if(identifierIndex.has(ast.name)){
                break;
            }
            let identifierValue = context[ast.name];
            if(!identifierValue){
                throw new Error(`Unknown variable '${ast.name}' in rxweb expression.`);
            }
            identifierIndex.set(ast.name, identifierObservables.length);
            identifierObservables.push(context[ast.name]);
            break;
        case 'Literal':
            break;
        case 'MemberExpression':
            collectIdentifiers(ast.object);
            break;
        case 'UnaryExpression':
            collectIdentifiers(ast.argument);
            break;
        }
    }

    function evaluateAst(ast, identifierValues){
        switch(ast.type){
        default:
            throw new Error(`Unknown type: ${ast.type}`);
        case 'BinaryExpression':
        case 'LogicalExpression':
            return combineLatest(
                evaluateAst(ast.left, identifierValues),
                evaluateAst(ast.right, identifierValues),
            )
                .pipe(mergeMap(([leftValue, rightValue]) => {
                    switch(ast.operator){
                    default:
                        throw new Error(`Unknown operator ${ast.operator}`);
                    case '==':
                        return of(leftValue == rightValue);
                    case '!=':
                        return of(leftValue != rightValue);
                    case '===':
                        return of(leftValue === rightValue);
                    case '!==':
                        return of(leftValue !== rightValue);
                    case '<':
                        return of(leftValue < rightValue);
                    case '>':
                        return of(leftValue > rightValue);
                    case '<=':
                        return of(leftValue <= rightValue);
                    case '>=':
                        return of(leftValue >= rightValue);
                    case '|':
                        return of(leftValue).pipe(rightValue);
                    case '||':
                        return of(leftValue || rightValue);
                    case '&&':
                        return of(leftValue && rightValue);
                        
                    }
                }));
            break;
        case 'Identifier':
            let i = identifierIndex.get(ast.name);
            return of(identifierValues[i]);
        case 'Literal':
            return of(ast.value);
        case 'MemberExpression':
            return evaluateAst(ast.object, identifierValues)
                .pipe(map(v => {
                    switch(ast.property.type){
                    default:
                        throw new Error(`Unknown MemberExpression property type: ${ast.property.type}`);
                    case 'Literal':
                        return v[ast.property.value];
                    case 'Identifier':
                        return v[ast.property.name];
                    }
                }));
        case 'UnaryExpression':
            switch(ast.operator){
            default:
                throw new Error(`Unknown unary operater ${ast.operator}`);
            case '!':
                return evaluateAst(ast.argument, identifierValues)
                    .pipe(map(v => !v));
            case '*':
                return evaluateAst(ast.argument, identifierValues)
                    .pipe(mergeMap(v => v));
            }
        }
    }
}

IfJoint.prototype.on = function(){
    if(!this.subscription){
        this.subscription = this.observable.subscribe();
    }
};

IfJoint.prototype.off = function(){
    if(this.subscription){
        this.subscription.unsubscribe();
        this.subscription = null;
    }
    for(let j of this.rootJoints){
        j.off();
    }
};

function ForJoint(component, element, context, events){
    let hook = addHookBefore(element);
    this.itemTemplate = element;
    element.parentNode.removeChild(element);
    let {itemVariableName, itemsProviderExpression} = parseForExpression(element.getAttribute('rxweb-for'));
    this.itemVariableName = itemVariableName;
    this.rootJoints = [];
    this.itemElements = [];
    this.observable = evaluateObservableExpression(jsep(itemsProviderExpression), context)
        .pipe(tap(items => {
            for(let j of this.rootJoints){
                j.off();
            }
            this.removeFormerItemElements();
            this.rootJoints = [];
            for(let item of items || []){
                let itemElement = this.itemTemplate.cloneNode(true);
                let itemContext = Object.assign({}, context);
                itemContext[this.itemVariableName] = of(item);
                appendChildJoints(component, this.rootJoints, itemElement, itemContext, events);
                this.itemElements.push(itemElement);
                hook.parentNode.insertBefore(itemElement, hook);
            }
            for(let j of this.rootJoints){
                j.on();
            }
        }));
    this.subcription = null;
}

ForJoint.terminal = true;

ForJoint.prototype.removeFormerItemElements = function(){
    for(let element of this.itemElements){
        element.parentNode.removeChild(element);
    }
    this.itemElements = [];
};

function parseForExpression(expression){
    let [itemVariableName, itemsProviderExpression] = expression.split(' of ');
    return {itemVariableName, itemsProviderExpression};
}

ForJoint.prototype.on = function(){
    if(!this.subscription){
        this.subscription = this.observable.subscribe();
    }
    for(let j of this.rootJoints){
        j.on();
    }
};

ForJoint.prototype.off = function(){
    if(this.subscription){
        this.subscription.unsubscribe();
        this.subscription = null;
    }
    for(let j of this.rootJoints){
        j.off();
    }
};

function ElementPropertyJoint(component, element, context, events, name){
    this.element = element;
    let consumerExpression = element.getAttribute(`rxweb-${name}`);
    let nameCamelCase = camelCase(name);
    this.observable = evaluateObservableExpression(jsep(consumerExpression), context)
        .pipe(tap(value => element[nameCamelCase] = value));
    this.subscription = null;
}

ElementPropertyJoint.prototype.on = function(){
    if(!this.subscription){
        this.subscription = this.observable.subscribe();
    }
};

ElementPropertyJoint.prototype.off = function(){
    if(this.subscription){
        this.subscription.unsubscribe();
        this.subscription = null;
    }
};

// TODO StylePropertyJoint is 90% the implementation of ElementPropertyJoint and should be centralized
function StylePropertyJoint(component, element, context, events, name){
    this.element = element;
    let consumerExpression = element.getAttribute(`rxweb-${name}`);
    let nameCamelCase = camelCase(name.substring('style-'.length));
    this.observable = evaluateObservableExpression(jsep(consumerExpression), context)
        .pipe(tap(value => element.style[nameCamelCase] = value));
    this.subscription = null;
}

StylePropertyJoint.prototype.on = function(){
    if(!this.subscription){
        this.subscription = this.observable.subscribe();
    }
};

StylePropertyJoint.prototype.off = function(){
    if(this.subscription){
        this.subscription.unsubscribe();
        this.subscription = null;
    }
};

function TranscludeJoint(component, element, context, events){
    this.component = component;
    this.element = element;
    this.transclusionSelector = element.getAttribute('rxweb-transclude');
    this.childElementsCreated = false;
    this.rootJoints = [];
}

TranscludeJoint.prototype.on = function(){
    if(!this.childElementsCreated){
        this.childElementsCreated = true;
        let transcludedNodes = this.component.transclusionChildren;
        if(this.transclusionSelector){
            transcludedNodes = transcludedNodes
                .filter(n => isElement(n) && n.matches(this.transclusionSelector));
        }
        // TODO maybe build these scopes lazy if they are required
        // by any child
        let events = this._buildScope('events');
        let context = this._buildScope('context');
        for(let childTemplate of transcludedNodes){
            let child = childTemplate.cloneNode(true);
            if(isElement(child)){
                appendChildJoints(this.component, this.rootJoints, child, context, events);
            }
            this.element.appendChild(child);
        }
    }
    for(let j of this.rootJoints){
        j.on();
    }
};

TranscludeJoint.prototype._buildScope = function(name){
    let scopes = [];
    let element = this.component.parentElement;
    while(element){
        if(element.rxweb){
            scopes.push(element.rxweb[name]);
        }
        element = element.parentElement;
    }
    scopes.push({});
    scopes.reverse();
    return Object.assign.apply(Object, scopes);
};

TranscludeJoint.prototype.off = function(){
    for(let j of this.rootJoints){
        j.off();
    }
};

function EventListenerJoint(component, element, context, events, name){
    this.element = element;
    this.context = context;
    this.name = name;
    let jointAttribute = `rxweb-${name}`;
    let producerExpression = element.getAttribute(jointAttribute);
    let [producerName, producerArgs] = parseProducerExpression(producerExpression);
    this.subject = events.get(producerName);
    this.producerArgs = producerArgs;
    this.listener = domEvent => {
        // TODO prototypical inheritance
        let context = Object.assign({}, {event: domEvent}, this.context);
        let args = producerArgs.length === 0 ? of([]) : forkJoin(producerArgs.map(arg => evaluate(arg, context)));
        args.subscribe(x => this.subject.next(x),
                       e => this.subject.error(e));
    };
}

EventListenerJoint.prototype.on = function(){
    this.element.addEventListener(this.name, this.listener, false);
};

EventListenerJoint.prototype.off = function(){
    this.element.removeEventListener(this.name, this.listener, false);
};

function evaluate(ast, context){
    switch(ast.type){
    default:
        throw new Error(`Unknown type: ${ast.type}`);
    case 'Identifier':
        return of(context[ast.name]);
    case 'Literal':
        return of(ast.value);
    case 'UnaryExpression':
        switch(ast.operator){
        default:
            throw new Error(`Unknown unary operator: ${ast.operator}`);
        case '*':
            return evaluate(ast.argument, context)
                .pipe(mergeMap(v => v));
        }
    }
}

/**
 * camelCase converts dash separated words into camel case.
 */
function camelCase(input) { 
    return input
        .toLowerCase()
        .replace(/-(.)/g, (m, g1) => {
            return g1.toUpperCase();
        });
}

function isElement(o){
    return typeof HTMLElement === 'object' ? o instanceof HTMLElement : o && typeof o === 'object' && o !== null && o.nodeType === 1 && typeof o.nodeName === 'string';
}

function empty(node){
    while(node.lastChild){
        node.removeChild(node.lastChild);
    }
}

function addHookBefore(element){
    let hook = document.createComment('rxweb-hook');
    element.parentNode.insertBefore(hook, element);
    return hook;
}
