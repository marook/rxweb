describe('rxweb', () => {
    let { BehaviorSubject, of } = rxjs;
    
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
    
    describe('hello-world component', () => {
        beforeAllAddTemplate('hello-world', '<h1>Hello World!</h1>');
        beforeAllDefineComponent('hello-world', events => ({}));
        beforeAllInstantiateComponent('hello-world');
        
        it('should have text content "Hello World!"', () => {
            expect(contentContainer.textContent).toBe('Hello World!');
        });
    });

    describe('rxweb-text-content static', () => {
        beforeAllAddTemplate('rxweb-text-content-static-comp', '<span rxweb-text-content="myInput"></span>');
        beforeAllDefineComponent('rxweb-text-content-static-comp', events => ({
            myInput: of('some text'),
        }));
        beforeAllInstantiateComponent('rxweb-text-content-static-comp');

        it('should render some text', () => {
            expect(contentContainer.textContent).toBe('some text');
        });
    });

    describe('rxweb-text-content dynamic', () => {
        let myInput;
        beforeAll(() => {
            myInput = new BehaviorSubject('');
        });
        afterAll(() => {
            myInput = undefined;
        });
        beforeAllAddTemplate('rxweb-text-content-dynamic-comp', '<span rxweb-text-content="myInput"></span>');
        beforeAllDefineComponent('rxweb-text-content-dynamic-comp', events => ({
            myInput: myInput.asObservable(),
        }));
        beforeAllInstantiateComponent('rxweb-text-content-dynamic-comp');

        beforeEach(() => {
            myInput.next('initial');
        });

        it('should render initial', () => {
            expect(contentContainer.textContent).toBe('initial');
        });

        describe('change myInput', () => {
            beforeEach(() => {
                myInput.next('changed');
            });

            it('should render changed', () => {
                expect(contentContainer.textContent).toBe('changed');
            });
        });
    });

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
