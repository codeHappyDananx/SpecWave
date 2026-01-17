# 终端图片粘贴契约

> `Story`：需求条目 STORY-000015(右侧终端交互增强)

## 接口清单

- `specwave:terminal:pasteImage`：终端图片粘贴通道，方式 `invoke`：异步调用

## 触发

- `TERMINAL_PASTE`：终端粘贴意图 触发时，`store`：状态编排 先尝试该通道
- 成功返回路径后，使用 `terminalWrite`：终端写入能力 写入路径

## 请求

```json
{
  "cwd": "项目根路径，可空",
  "prefix": "img-"
}
```

## 响应

成功：

```json
{
  "ok": true,
  "fileName": "img-20260101-000000-000.png",
  "filePath": "F:\\项目\\.terminal-paste\\img-20260101-000000-000.png"
}
```
失败：

```json
{
  "ok": false,
  "code": "clipboard-no-image",
  "error": "clipboard-no-image"
}
```

## 字段语义

- `cwd`：保存根目录，空值时使用当前项目根或应用工作目录
- `prefix`：文件名前缀，仅保留字母数字与 `-` `_`，自动补 `-`
- `filePath`：终端要写入的绝对路径
- `code`：失败原因

## 错误码与失败语义

- `clipboard-no-image`：剪贴板无图片 → 直接回退文本粘贴
- `clipboard-image-empty`：图片为空 → 直接回退文本粘贴
- `create-paste-dir-failed`：目录创建失败 → 直接回退文本粘贴
- `write-failed`：写入失败 → 直接回退文本粘贴

## 状态机

- 空闲 → 处理中 → 成功/失败
- 失败时不弹窗，不阻断输入

## 回归清单

- 剪贴板有图片 → 终端插入路径，`.terminal-paste` 自动生成
- 剪贴板无图片 → 文本粘贴保持原逻辑
- `.gitignore` 增加 `.terminal-paste/`（项目根是 `git`：版本库 时）
