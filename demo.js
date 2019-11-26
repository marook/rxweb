let { map, takeUntil } = rxjs.operators;

rxweb.define('my-comp', events => {
    let counter = new rxjs.BehaviorSubject(0);
    events.increaseCounter
        .pipe(map(([inc, $event]) => {
            $event.preventDefault();
            $event.stopPropagation();
            counter.next(counter.getValue() + inc);
        }),
              takeUntil(events.destroy))
        .subscribe();
    return {
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
            }),
    };
});
