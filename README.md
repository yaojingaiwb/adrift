# Adrift 自动检查船只状态机器人

这是一个自动化脚本，用于每天打开 [Adrift](https://adrift.syndicate.io/) 游戏网站、登录并检查船只是否需要修复。如果需要修复，脚本会自动点击修复按钮，并持续修复直到船只状态达标。

## 功能

- 支持多账号批量处理
- 自动打开 Adrift 网站并登录
- 检查船只是否需要修复
- 如果需要修复，自动点击修复按钮直到达标
- 自动处理确认按钮
- 自动检测"Repair Needed"状态
- 自动检测"Your ship sank"状态
- 线程池模式处理账号，提高效率
- 记录详细日志，便于排查问题
- 失败重试机制，确保稳定性
- 自动导出账号状态到状态.txt文件

## 安装

1. 确保已安装 [Node.js](https://nodejs.org/) (v14 或更高版本)

2. 克隆此仓库或下载代码

3. 安装依赖
   ```bash
   npm install
   ```

4. 安装 Playwright 浏览器
   ```bash
   npx playwright install chromium
   ```

5. 创建 emails.txt 文件并添加您的账号
   ```
   email1@example.com
   email2@example.com
   email3@example.com
   ```

## 配置

在 `index.js` 文件中的 `config` 对象中修改配置：

```javascript
const config = {
  // Adrift 网站URL
  adriftUrl: 'https://adrift.syndicate.io/',
  // 邮箱文件路径
  emailsFilePath: './emails.txt',
  // 所有账号的密码
  password: 'your-password',
  // 检查频率（小时）
  checkInterval: 24,
  // 并发处理的最大账号数
  maxConcurrent: 1,
  // 修复条件：如果安全修复时间小于该值（小时），则进行修复
  repairThreshold: 24, // 1天
  // 浏览器配置
  browser: {
    headless: true, // 设置为true可以隐藏浏览器界面
    slowMo: 50, // 减慢操作速度，方便观察
    incognito: true, // 使用无痕模式
  },
  // 日志配置
  logging: {
    enabled: true,
    logToFile: true,
    logFilePath: './adrift.log',
  },
  // 状态文件路径
  statusFilePath: './状态.txt'
};
```

## 使用方法

运行脚本：

```bash
node index.js
```

脚本会自动处理 emails.txt 中的所有账号，并根据配置的修复阈值自动修复船只。处理结果会保存到 `状态.txt` 文件中。

## 状态文件

脚本会将每个账号的处理结果保存到 `状态.txt` 文件中，格式如下：

```json
{
  "example@example.com": {
    "timestamp": "2025-07-10T15:00:00.000Z",
    "success": true,
    "status": "状态正常，安全时间: 48.0小时"
  },
  "test@example.com": {
    "timestamp": "2025-07-10T15:10:00.000Z",
    "success": true,
    "status": "修复完成，安全时间: 36.5小时"
  },
  "failed@example.com": {
    "timestamp": "2025-07-10T15:20:00.000Z",
    "success": false,
    "status": "处理失败: 登录失败"
  }
}
```

状态文件会在每次运行脚本后更新，如果账号已存在就覆盖，没有就添加。

## 处理逻辑

1. 脚本会读取 emails.txt 文件中的所有邮箱
2. 使用线程池模式处理账号，当一个账号处理完成后，立即从队列中取出下一个账号进行处理
3. 对于每个账号，脚本会尝试登录并检查船只状态
4. 如果安全修复时间小于配置的阈值（默认24小时），或检测到"Repair Needed"状态，脚本会自动修复船只
5. 修复后会再次检查状态，如果仍未达标，会继续修复直到达标或达到最大修复次数
6. 如果检测到"Your ship sank"状态，脚本会跳过当前账号
7. 如果登录失败或无法获取船只状态，脚本会重试（最多10次）

## 错误处理

- 脚本会记录详细日志到 adrift.log 文件
- 错误信息会记录到 error.log 文件
- 对于失败的账号，脚本会自动重试（最多5次）

## 注意事项

- 首次登录可能需要手动输入验证码，建议先手动登录一次
- 建议将 `headless` 选项设置为 `true` 以在后台运行（在生产环境中）
- 如果需要处理大量账号，可以调整 `maxConcurrent` 参数控制并发数量

## 许可

MIT 