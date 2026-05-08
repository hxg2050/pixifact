function wordsFromName(input: string) {
    return input
        .replace(/\.scene$/i, '')
        .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
        .split(/[^a-zA-Z0-9]+/)
        .filter(Boolean);
}

function capitalize(word: string) {
    return word ? `${word[0].toUpperCase()}${word.slice(1)}` : word;
}

export function sceneAssetName(input: string) {
    return wordsFromName(input)
        .map((word) => capitalize(word.toLowerCase()))
        .join('');
}

export function sceneFileName(input: string) {
    return `${sceneAssetName(input)}.scene`;
}

export function sceneRootKey(name: string) {
    const assetName = sceneAssetName(name);
    return `${assetName[0].toLowerCase()}${assetName.slice(1)}Root`;
}
