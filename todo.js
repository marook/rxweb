let { merge } = rxjs;
let { map, tap } = rxjs.operators;

rxweb.define('todo-board', events => {
    let cardsSubject = new rxjs.BehaviorSubject([
        'bring out trash',
        'walk dog',
        'water plants',
    ]);
    let addCard = events.addCard
        .pipe(tap(card => {
            let cards = cardsSubject.getValue().slice();
            cards.push(card);
            cardsSubject.next(cards);
        }));
    let removeCard = events.removeCard
        .pipe(tap(card => {
            cardsSubject.next(cardsSubject.getValue().filter(c => c !== card));
        }));
    return {
        _: merge(addCard, removeCard),
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
        removedCard: events.removeCard
            .pipe(map(([card]) => {
                return card;
            })),
    };
});
