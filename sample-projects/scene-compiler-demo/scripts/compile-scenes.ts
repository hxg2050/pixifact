import { compileScenes } from 'pixifact/compiler-node';

await compileScenes({
    projectRoot: new URL('..', import.meta.url),
});
