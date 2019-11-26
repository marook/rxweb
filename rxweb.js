let rxweb = (function(){
    let { map, tap, distinct } = rxjs.operators;
    
    function define(name, bind){
        customElements.define(name, class extends HTMLElement {
            constructor(){
                super();
                this.subscriptions = [];
                let [componentElement, events] = buildComponentElement(name);
                let outputs = bind(events, this);
                let context = Object.assign({}, events, outputs);
                bindComponentDomOutputs(componentElement, outputs);
                bindComponentIfElements(componentElement, context);
                this.appendChild(componentElement);
            }

            connectedCallback(){
                console.log('>>> connected', this);
                // TODO
            }

            disconnectedCallback(){
                console.log('>>> disconnected', this);
                // TODO
            }
        });
    }

    function getTemplate(name){
        return document.querySelector(`template[rxweb-component=${name}]`);
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
                        '$event': e,
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

    function bindComponentDomOutputs(componentElement, outputs){
        for(let [htmlKey, elementKey] of [['text-content', 'textContent']]){
            for(let consumer of componentElement.querySelectorAll(`*[rxweb-${htmlKey}]`)){
                let consumerName = consumer.getAttribute(`rxweb-${htmlKey}`);
                let subscription = outputs[consumerName]
                    .pipe(tap(value => consumer[elementKey] = value))
                    .subscribe();
            }
        }
    }

    function bindComponentIfElements(componentElement, context){
        for(let ifElement of componentElement.querySelectorAll('*[rxweb-if]')){
            let ifExpression = ifElement.getAttribute('rxweb-if');
            let parent = ifElement.parentNode;
            evaluateObservableExpression(jsep(ifExpression), context)
                .pipe(
                    map(v => !!v),
                    distinct(),
                    tap(showElement => {
                        ifElement.style.display = showElement ? 'block' : 'none';
                        // TODO remove and back insert element in DOM
                    })
                )
                .subscribe();
        }
    }

    return {
        define,
    };
})();
