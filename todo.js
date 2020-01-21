let { merge, of } = rxjs;
let { map, tap } = rxjs.operators;

rxweb.define('todo-board', events => {
    let cardsSubject = new rxjs.BehaviorSubject([
        {
            createdAt: new Date(2019, 11, 1),
            title: 'bring out trash',
        },
        {
            createdAt: new Date(2020, 0, 1),
            title: 'walk dog',
        },
        {
            createdAt: new Date(2017, 4, 31),
            title: 'water plants',
        },
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
                return {
                    createdAt: new Date(),
                    title: cardTitle,
                };
            })),
        removedCard: events.removeCard
            .pipe(map(([card]) => {
                return card;
            })),
        date: of(map(d => `${d.getFullYear()}-${d.getMonth()+1}-${d.getDate()}`)),
    };
});
