describe('rxweb', () => {
    let templateContainer, contentContainer;
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
        beforeEachInstantiateComponent('hello-world');
        
        it('should have text content "Hello World!"', () => {
            expect(contentContainer.textContent).toBe('Hello World!');
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

    function beforeEachInstantiateComponent(componentName){
        let element;
        beforeEach(() => {
            element = document.createElement(componentName);
            contentContainer.appendChild(element);
        });
        afterEach(() => {
            contentContainer.removeChild(element);
            element = undefined;
        });
    }

});
