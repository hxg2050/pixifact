#!/usr/bin/env bun
import { createPixifactProject } from './createPixifactProject';

function usage() {
    return [
        '用法：',
        '  bun create pixifact <project-name>',
        '',
    ].join('\n');
}

const name = process.argv[2];

if (!name || name === '--help' || name === '-h') {
    process.stdout.write(usage());
    process.exitCode = name ? 0 : 1;
} else {
    try {
        const result = await createPixifactProject({ name });
        process.stdout.write(`已创建 ${result.name}：${result.root}\n`);
        process.stdout.write('已初始化 Git 仓库，并安装 Pixifact skill 到 .agents/skills/pixifact/。\n');
        process.stdout.write([
            '下一步：',
            `  cd ${result.name}`,
            '  bun install',
            '',
            '项目命令：',
            '  bun run dev      启动 Web 开发服务（默认启用 --inspect 调试）',
            '  bun run build    构建 Web 生产版本',
            '  bun run compile  编译 Scene',
            '  bun run editor   启动 Pixifact 编辑器',
            '  bun run validate 校验项目',
            '',
        ].join('\n'));
    } catch (error) {
        process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
        process.exitCode = 1;
    }
}

export { createPixifactProject };
