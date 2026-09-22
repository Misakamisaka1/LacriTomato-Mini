# 发布约定

当任务涉及生成 Windows 安装包（`npm run dist`）时，完成同一次 GitHub Release 发布：

1. 对照最新 GitHub Release 和 Git 标签，为 `package.json`、`package-lock.json` 选择并写入一个未使用的新版本号。
2. 完成类型检查、测试和打包，确认安装包文件名中的版本与包版本一致。
3. 提交版本变更，创建并推送 `vX.Y.Z` 标签；在 `https://github.com/Misakamisaka1/LacriTomato-Mini/releases` 创建对应 Release，写明本版主要变化并上传该版本的 Windows 安装包。
4. 核对 Release 页面可见、标签指向本次提交、安装包可下载。只有这些都完成，才将打包任务视为完成；若发布受阻，明确报告未完成的环节。
