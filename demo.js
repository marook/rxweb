let { map, takeUntil } = rxjs.operators;

// defines a custom component. the second argument is a binding callback
// which will be invoked once for every component instance. events
// contains observables for all events which are produced within the
// component. they are determined from the component's template.
rxweb.define('my-comp', events => {
    let counter = new rxjs.BehaviorSubject(0);
    // return output observables which are accessed within the template.
    return {
        // the _ output has a special meaning. it will be subscribed
        // while the component is within the document.
        _: events.increaseCounter
            .pipe(map(([inc, $event]) => {
                $event.preventDefault();
                counter.next(counter.getValue() + inc);
            })),
        counter,
        counterText: counter
            .pipe(map(c => `Count is ${c}.`)),
        counterItems: counter
            .pipe(map(c => {
                let items = [];
                for(let i = 0; i < c; ++i){
                    items.push(`${i}`);
                }
                return items;
            })),
    };
});
