const recordKey = 'pixifact-game-starter.best-score';

export class WebRecordStore {
    constructor(private readonly storage: Pick<Storage, 'getItem' | 'setItem'>) {}

    read(): number {
        const saved = this.storage.getItem(recordKey);
        return saved === null ? 0 : JSON.parse(saved) as number;
    }

    write(bestScore: number) {
        this.storage.setItem(recordKey, JSON.stringify(bestScore));
    }
}
