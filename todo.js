let { map, tap } = rxjs.operators;

rxweb.define('todo-board', events => {
    let cardsSubject = new rxjs.BehaviorSubject([
        'bring out trash',
        'walk dog',
        'water plants',
    ]);
    return {
        _: events.addCard
            .pipe(tap(([card]) => {
                let cards = cardsSubject.getValue().slice();
                cards.push(card);
                cardsSubject.next(cards);
            })),
        cards: cardsSubject.asObservable(),
    };
});

rxweb.define('todo-list', events => {
    return {
        addedCard: events.submitCard
            .pipe(map(([event]) => {
                event.preventDefault();
                let cardTitle = event.target.title.value;
                event.target.title.value = '';
                return cardTitle;
            })),
    };
});
