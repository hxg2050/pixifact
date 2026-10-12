#!/usr/bin/env bun
import { createPixifactProject } from './createPixifactProject';
import { parseArgs } from 'node:util';

function usage() {
    return [
        '用法：',
        '  bun create pixifact <project-name> [--template minimal|game]',
        '  minimal：最小 Scene 项目；game：基础游戏框架和一套基础 UI。',
        '',
    ].join('\n');
}

try {
    const { values, positionals } = parseArgs({
        args: process.argv.slice(2),
        allowPositionals: true,
        options: {
            template: { type: 'string', default: 'minimal' },
            help: { type: 'boolean', short: 'h' },
        },
    });
    const name = positionals[0];
    if (!name || values.help) {
        process.stdout.write(usage());
        process.exitCode = values.help ? 0 : 1;
    } else {
        if (positionals.length !== 1) throw new Error('请指定一个项目名称。');
        const template = values.template;
        if (template !== 'minimal' && template !== 'game') {
            throw new Error('模板必须为 minimal 或 game。');
        }
        const result = await createPixifactProject({ name, template });
        process.stdout.write(`已创建 ${result.name}：${result.root}\n`);
        process.stdout.write('已初始化 Git 仓库，并安装 Pixifact skill 到 .agents/skills/pixifact/。\n');
        process.stdout.write([
            '下一步：',
            `  cd ${result.name}`,
            '  bun install',
            '',
            '项目命令：',
            '  bun run dev      启动 Web 开发服务（预览和 --inspect 调试均支持局域网）',
            '  bun run build    构建 Web 生产版本',
            '  bun run compile  编译 Scene',
            '  bun run editor   启动 Pixifact 编辑器',
            '  bun run validate 校验项目',
            '',
        ].join('\n'));
        if (template === 'game') {
            process.stdout.write('  bun run typecheck     检查游戏 TypeScript\n');
            process.stdout.write('更换 UI 素材：直接替换 assets/ui/ 中的同名 PNG，保持图片尺寸和九宫格边距；然后重启开发服务。详见 README。\n');
        }
    }
} catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
}

export { createPixifactProject };
