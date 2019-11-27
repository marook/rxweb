let rxweb = (function(){
    let { map, tap, distinct } = rxjs.operators;

    let eventJointNames = [
        'click',
        'load',
    ];

    /**
     * jointFactories defines possible rxweb joints and their execution
     * order.
     */
    let jointFactories = [
        ['if', IfJoint],
        ['for', ForJoint],
        ['text-content', TextContentJoint],
    ].concat(eventJointNames.map(name => [name, EventListenerJoint]));

    let jointFactoryByName = new Map(jointFactories);

    function define(name, bind){
        customElements.define(name, class extends HTMLElement {
            constructor(){
                super();
                let template = getTemplate(name).content.cloneNode(true);
                let eventSubjects = collectEventSubjects(template);
                let events = Object.fromEntries(Array.from(eventSubjects).map(([name, subject]) => [name, subject.asObservable()]));
                let outputs = bind(events);
                let rootContext = Object.assign({}, events, outputs);
                this.componentObservable = rootContext._ || rxjs.of();
                this.componentSubscription = null;
                this.rootJoints = [];
                for(let element of template.children){
                    appendJoints(this.rootJoints, element, rootContext, eventSubjects);
                }
                this.appendChild(template);
            }

            connectedCallback(){
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
            }
        });
    }

    /**
     * appendJoints searches for the first layer of dynamic elements in
     * the template element.
     */
    function appendJoints(joints, element, context, events){
        // TODO find a good name for these "joints" we look for in this function and rename the name of the function
        let jointAttributes = Array.from(element.getAttributeNames())
            .filter(name => name.startsWith('rxweb-'))
            .map(name => name.substring('rxweb-'.length));
        let jointChildren = joints;
        if(jointAttributes.length === 0){
            for(let childElement of element.children){
                appendJoints(jointChildren, childElement, context, events);
            }
        } else if(jointAttributes.length === 1){
            let jointName = jointAttributes[0];
            let jointFactory = jointFactoryByName.get(jointName);
            if(!jointFactory){
                throw new Error(`Found unknown rxweb-${jointName} attribute.`);
            }
            let joint = new jointFactory(element, context, events, jointName);
            joints.push(joint);
            jointChildren = joint.children;
        } else {
            throw new Error(`Only one rxweb-* attribute per element allowed (right now, sorry)`);
        }
    }

    function collectEventSubjects(element){
        let subjects = new Map();
        for(let eventName of eventJointNames){
            let eventAttribute = `rxweb-${eventName}`;
            for(let producer of element.querySelectorAll(`*[${eventAttribute}]`)){
                let producerExpression = producer.getAttribute(eventAttribute);
                let [producerName, producerArgs] = parseProducerExpression(producerExpression);
                if(subjects.has(producerName)){
                    continue;
                }
                subjects.set(producerName, new rxjs.Subject());
            }            
        }
        return subjects;
    }

    function buildComponentElement(name){
        let element = getTemplate(name).content.cloneNode(true);
        let subjects = new Map();
        let events = {};
        for(let event of ['click']){
            let eventAttribute = `rxweb-${event}`;
            for(let producer of element.querySelectorAll(`*[${eventAttribute}]`)){
                let producerExpression = producer.getAttribute(eventAttribute);
                let [producerName, producerArgs] = parseProducerExpression(producerExpression);
                let producerSubject;
                if(subjects.has(producerName)){
                    producerSubject = subjects.get(producerName);
                } else {
                    producerSubject = new rxjs.Subject();
                    subjects.set(producerName, producerSubject);
                }
                producer.addEventListener(event, e => {
                    let context = {
                        'event': e,
                    };
                    let args = producerArgs.map(arg => evaluate(arg, context));
                    producerSubject.next(args);
                }, false);
                events[producerName] = producerSubject.asObservable();
            }
        }
        // TODO do some destroy eventing
        let destroySubject = new rxjs.Subject();
        events['destroy'] = destroySubject.asObservable();
        return [element, events];
    }

    function getTemplate(name){
        return document.querySelector(`template[rxweb-component=${name}]`);
    }

    function buildProducer(producer, event, eventAttribute){
        return [producerName, producerSubject.asObservable()];
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

    function IfJoint(element, context, events){
        this.element = element;
        this.rootJoints = [];
        for(let child of element.children){
            appendJoints(this.rootJoints, child, context, events);
        }
        let ifExpression = element.getAttribute('rxweb-if');
        this.observable = evaluateObservableExpression(jsep(ifExpression), context)
            .pipe(
                map(v => !!v),
                distinct(),
                tap(showElement => {
                    element.style.display = showElement ? 'block' : 'none';
                    // TODO remove and back insert element in DOM instead of modifying display style
                    if(showElement){
                        for(let j of this.rootJoints){
                            j.on();
                        }
                    } else {
                        for(let j of this.rootJoints){
                            j.off();
                        }
                    }
                })
            );
        this.subscription = null;
    }

    function evaluateObservableExpression(ast, context){
        let identifierIndex = new Map();
        let identifierObservables = [];
        collectIdentifiers(ast);
        return rxjs.combineLatest(identifierObservables)
            .pipe(map(identifierValues => {
                return evaluateAst(ast, identifierValues);
            }));

        function collectIdentifiers(ast){
            switch(ast.type){
                default:
                    throw new Error(`Unknown type: ${ast.type}`);
                case 'BinaryExpression':
                    collectIdentifiers(ast.left);
                    collectIdentifiers(ast.right);
                    break;
                case 'Identifier':
                    if(identifierIndex.has(ast.name)){
                        break;
                    }
                    let identifierValue = context[ast.name];
                    if(!identifierValue){
                        throw new Error(`Unknown variable ${ast.name} in rxweb-if expression.`);
                    }
                    identifierIndex.set(ast.name, identifierObservables.length);
                    identifierObservables.push(context[ast.name]);
                    break;
                case 'Literal':
                    break;
            }
        }

        function evaluateAst(ast, identifierValues){
            switch(ast.type){
                default:
                    throw new Error(`Unknown type: ${ast.type}`);
                case 'BinaryExpression':
                    let leftValue = evaluateAst(ast.left, identifierValues);
                    let rightValue = evaluateAst(ast.right, identifierValues);
                    switch(ast.operator){
                        default:
                            throw new Error(`Unknown operator ${ast.operator}`);
                        case '<=':
                            return leftValue <= rightValue;
                    }
                    break;
                case 'Identifier':
                    let i = identifierIndex.get(ast.name);
                    return identifierValues[i];
                case 'Literal':
                    return ast.value;
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

    function ForJoint(element, context, events){
        // TODO right now we just threat parent like it has no other children than the for joint
        let parent = element.parentNode;
        this.itemTemplate = element;
        element.parentNode.removeChild(element);
        let {itemVariableName, itemsProviderName} = parseForExpression(element.getAttribute('rxweb-for'));
        this.itemVariableName = itemVariableName;
        this.rootJoints = [];
        this.observable = context[itemsProviderName]
            .pipe(tap(items => {
                for(let j of this.rootJoints){
                    j.off();
                }
                empty(parent);
                this.rootJoints = [];
                for(let item of items){
                    let itemElement = this.itemTemplate.cloneNode(true);
                    let itemContext = Object.assign({}, context);
                    itemContext[this.itemVariableName] = rxjs.of(item);
                    for(let element of itemElement.children){
                        appendJoints(this.rootJoints, element, itemContext, events);
                    }
                    parent.appendChild(itemElement);
                }
                for(let j of this.rootJoints){
                    j.on();
                }
            }));
        this.subcription = null;
    }

    function parseForExpression(expression){
        let [itemVariableName, itemsProviderName] = expression.split(' of ');
        return {itemVariableName, itemsProviderName};
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

    function TextContentJoint(element, context){
        this.element = element;
        let consumerName = element.getAttribute(`rxweb-text-content`);
        this.observable = context[consumerName]
            .pipe(tap(value => element.textContent = value));
        this.subscription = null;
    }

    TextContentJoint.prototype.on = function(){
        if(!this.subscription){
            this.subscription = this.observable.subscribe();
        }
    };

    TextContentJoint.prototype.off = function(){
        if(this.subscription){
            this.subscription.unsubscribe();
            this.subscription = null;
        }
    };

    function EventListenerJoint(element, context, events, name){
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
            let args = producerArgs.map(arg => evaluate(arg, context));
            this.subject.next(args);
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
                return context[ast.name];
            case 'Literal':
                return ast.value;
        }
    }

    function empty(node){
        while(node.lastChild){
            node.removeChild(node.lastChild);
        }
    }

    return {
        define,
    };
})();
