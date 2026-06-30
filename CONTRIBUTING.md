# Contributing

感谢你对积分银行的关注！这是一个小型家庭工具项目，我们欢迎各种形式的贡献。

## 关于项目

积分银行是一个纯前端儿童成长激励工具，基于代币经济理论，将抽象的"自律"转化为有形的积分系统。

**核心理念：** 积分不是为了控制孩子，而是让孩子看见自己的努力是有价值的。

## 如何贡献

### 报告 Bug
使用 [Bug Report 模板](../../issues/new?template=bug-report.yml) 提交问题。请尽量提供：
- 复现步骤
- 期望行为 vs 实际行为
- 运行环境（浏览器、操作系统）

### 功能建议
使用 [Feature Request 模板](../../issues/new?template=feature-request.yml) 提交建议。

### 提交代码
1. Fork 本仓库
2. 创建特性分支：`git checkout -b feature/amazing-feature`
3. 提交更改：`git commit -m 'feat: add amazing feature'`
4. 推送到分支：`git push origin feature/amazing-feature`
5. 提交 Pull Request

### 代码规范
- 本项目为纯前端应用（HTML/CSS/JS），无构建工具
- 保持代码简洁，遵循现有风格
- 修改后请在浏览器中手动验证功能正常

## 代码贡献须知

由于本项目是面向家庭的轻量工具，**改动范围应严格控制**：
- 不要引入新的外部依赖
- 不要改变核心数据模型（五大维度、积分系统）
- 不要修改存储层（localStorage + IndexedDB）的接口
- 文档和 UI 改进是最受欢迎的贡献方向

## 行为准则

请保持友善和建设性的讨论氛围。尊重每一位贡献者，尤其是家长用户的使用体验。
