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

    describeComponent('<button type="button" rxweb-click="peng()">peng</button>', [], events => {
        let pengEmits, pengSubscription;
        beforeEach(() => {
            pengEmits = [];
            pengSubscription = events.peng.subscribe(x => pengEmits.push(x));
        });
        afterEach(() => {
            pengSubscription.unsubscribe();
            pengSubscription = undefined;
        });

        it('should retrieve no emit', () => {
            expect(pengEmits).toEqual([]);
        });

        describe('click button', () => {
            beforeEach(() => {
                contentContainer.querySelector('button').click();
            });

            it('should retrieve one emit', () => {
                expect(pengEmits).toEqual([
                    [],
                ]);
            });
        });
    });

    describeComponent('<button type="button" rxweb-click="peng(event)">peng</button>', [], events => {
        let pengEmits, pengSubscription;
        beforeEach(() => {
            pengEmits = [];
            pengSubscription = events.peng.subscribe(x => pengEmits.push(x));
        });
        afterEach(() => {
            pengSubscription.unsubscribe();
            pengSubscription = undefined;
        });

        describe('click button', () => {
            beforeEach(() => {
                contentContainer.querySelector('button').click();
            });

            it('should retrieve one emit', () => {
                expect(pengEmits.length).toBe(1);
                let [event] = pengEmits[0];
                expect(event instanceof MouseEvent).toBe(true);
            });
        });
    });

    describeComponent('before<span rxweb-for="_ of items">x</span>after', ['items'], (events, outputSubjects) => {
        beforeEach(() => {
            outputSubjects.items.next([
                0,
                1,
            ]);
        });

        it('should produce xx text content', () => {
            expect(contentContainer.textContent).toBe('beforexxafter');
        });
    });

    describeComponent('<div><span rxweb-for="_ of items">x</span></div>', ['items'], (events, outputSubjects) => {
        beforeEach(() => {
            outputSubjects.items.next([
                0,
                1,
            ]);
        });

        it('should produce xx text content', () => {
            expect(contentContainer.textContent).toBe('xx');
        });
    });

    describeComponent('<span rxweb-for="i of items"><span rxweb-text-content="i"></span></span>', ['items'], (events, outputSubjects) => {
        beforeEach(() => {
            outputSubjects.items.next([
                'a',
                'b',
            ]);
        });

        it('should produce xx text content', () => {
            expect(contentContainer.textContent).toBe('ab');
        });
    });

    describeComponent('<span rxweb-if="myFlag">flag</span>', ['myFlag'], (events, outputSubjects) => {
        beforeEach(() => {
            outputSubjects.myFlag.next(false);
        });

        it('should not show flag', () => {
            expect(contentContainer.textContent).toBe('');
        });

        describe('set flag', () => {
            beforeEach(() => {
                outputSubjects.myFlag.next(true);
            });

            it('should show flag', () => {
                expect(contentContainer.textContent).toBe('flag');
            });
        });
    });

    describeComponent('before <span rxweb-if="myFlag">flag</span> after', ['myFlag'], (events, outputSubjects) => {
        beforeEach(() => {
            outputSubjects.myFlag.next(true);
        });

        it('should not show flag', () => {
            expect(contentContainer.textContent).toBe('before flag after');
        });
    });

    function describeComponent(body, outputNames, f){
        let componentName = `rxweb-test-component-${nextComponentId++}`;
        describe(`the template ${body}`, () => {
            let events = {}, outputSubjects = {};
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
                Object.assign(events, _events_);
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
