describe('rxweb', () => {
    let { Subject, of } = rxjs;

    let nextComponentId = 1;
    
    let templateContainer, contentContainer, element;
    beforeAll(() => {
        templateContainer = document.createElement('div');
        document.body.appendChild(templateContainer);
        contentContainer = document.createElement('div');
        document.body.appendChild(contentContainer);
    });
    afterAll(() => {
        document.body.removeChild(contentContainer);
        contentContainer = undefined;
        document.body.removeChild(templateContainer);
        templateContainer = undefined;
    });

    describeComponent('<h1>Hello World!</h1>', [], () => {
        it('should have text content "Hello World!"', () => {
            expect(contentContainer.textContent).toBe('Hello World!');
        });
    });

    describeComponent('<span rxweb-text-content="myInput"></span>', ['myInput'], (events, outputs) => {
        beforeEach(() => {
            outputs.myInput.next('initial');
        });

        it('should render initial', () => {
            expect(contentContainer.textContent).toBe('initial');
        });

        describe('change myInput', () => {
            beforeEach(() => {
                outputs.myInput.next('changed');
            });

            it('should render changed', () => {
                expect(contentContainer.textContent).toBe('changed');
            });
        });
    });

    function describeComponent(body, outputNames, f){
        let componentName = `rxweb-test-component-${nextComponentId++}`;
        describe(`the template ${body}`, () => {
            let events, outputSubjects = {};
            beforeAll(() => {
                for(let name of outputNames){
                    outputSubjects[name] = new Subject();
                }
            });
            afterAll(() => {
                outputSubjects = undefined;
            });
            beforeAllAddTemplate(componentName, body);
            beforeAllDefineComponent(componentName, _events_ => {
                events = _events_;
                let output = {};
                for(let k of outputNames){
                    output[k] = outputSubjects[k].asObservable();
                }
                return output;
            });
            afterAll(() => {
                events = undefined;
            });
            beforeAllInstantiateComponent(componentName);

            f(events, outputSubjects);
        });
    }

    function beforeAllAddTemplate(componentName, body){
        beforeAll(() => {
            let template = document.createElement('template');
            template.setAttribute('rxweb-component', componentName);
            template.innerHTML = body;
            templateContainer.appendChild(template);
        });
    }

    function beforeAllDefineComponent(componentName, bind){
        beforeAll(() => {
            rxweb.define(componentName, bind);
        });
    }

    function beforeAllInstantiateComponent(componentName){
        let element;
        beforeAll(() => {
            element = document.createElement(componentName);
            contentContainer.appendChild(element);
        });
        afterAll(() => {
            contentContainer.removeChild(element);
            element = undefined;
        });
    }

});
