# @pixifact/platform-douyin

## 0.10.0

## 0.9.0

## 0.8.0

## 0.7.0

### Minor Changes

- d4e052a: 统一 Web、微信和抖音的 Vite 构建链、单入口、mode/env 与 PixiJS Assets 资源加载，并将微信和抖音 Runtime 拆为按需安装的平台包。

### Patch Changes

- 等待抖音小游戏图片的原生加载事件，避免冷启动时 PixiJS 在图片解码完成前创建纹理。
