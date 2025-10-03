const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

// 配置信息
const config = {
  // Adrift 网站URL
  adriftUrl: 'https://adrift.syndicate.io/',
  // 邮箱文件路径
  emailsFilePath: './emails.txt',
  // 所有账号的密码
  password: 'qqqq1111',
  // 检查频率（小时）
  checkInterval: 11,
  // 并发处理的最大账号数
  maxConcurrent: 6,
  // 修复条件：如果安全修复时间小于该值（小时），则进行修复
  repairThreshold: 12, // 1天
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

// 创建必要的目录
function ensureDirectoriesExist() {
  // 确保error.log文件存在
  const errorLogPath = path.join(__dirname, 'error.log');
  if (!fs.existsSync(errorLogPath)) {
    fs.writeFileSync(errorLogPath, '', 'utf8');
  }
  
  // 确保状态.txt文件存在
  const statusFilePath = path.join(__dirname, config.statusFilePath);
  if (!fs.existsSync(statusFilePath)) {
    fs.writeFileSync(statusFilePath, '', 'utf8');
  }
}

// 日志函数
function log(message, account = '') {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}]${account ? ' [' + account + ']' : ''} ${message}`;
  
  console.log(logMessage);
  
  if (config.logging.enabled && config.logging.logToFile) {
    fs.appendFileSync(config.logging.logFilePath, logMessage + '\n');
  }
}

// 记录错误到文本文件
function logErrorToFile(email, errorMsg) {
  const logPath = path.join(__dirname, 'error.log');
  const now = new Date();
  const utcPlus8Time = new Date(now.getTime() + (8 * 60 * 60 * 1000));
  const line = `[${utcPlus8Time.toISOString()}] [${email}] ${errorMsg}\n`;
  fs.appendFileSync(logPath, line, 'utf8');
}

// 更新账号状态到状态文件
function updateStatusFile(email, status, isSuccess) {
  try {
    const statusFilePath = path.join(__dirname, config.statusFilePath);
    let statusData = {};
    
    // 读取现有状态文件
    if (fs.existsSync(statusFilePath)) {
      const fileContent = fs.readFileSync(statusFilePath, 'utf8');
      if (fileContent.trim()) {
        try {
          statusData = JSON.parse(fileContent);
        } catch (parseError) {
          log(`解析状态文件出错: ${parseError.message}`);
          // 如果解析失败，使用空对象
          statusData = {};
        }
      }
    }
    
    // 更新当前账号状态
    statusData[email] = {
      timestamp: new Date().toISOString(),
      success: isSuccess,
      status: status || '未知状态',
    };
    
    // 写入状态文件
    fs.writeFileSync(statusFilePath, JSON.stringify(statusData, null, 2), 'utf8');
    log(`已更新账号 ${email} 的状态到状态文件`, email);
  } catch (error) {
    log(`更新状态文件出错: ${error.message}`, email);
  }
}

// 从文件中读取邮箱列表
async function readEmails() {
  try {
    if (!fs.existsSync(config.emailsFilePath)) {
      log(`邮箱文件不存在: ${config.emailsFilePath}`);
      return [];
    }
    
    const content = fs.readFileSync(config.emailsFilePath, 'utf8');
    return content.split('\n')
      .map(line => line.trim())
      .filter(line => line && line.includes('@'));
  } catch (error) {
    log(`读取邮箱文件出错: ${error.message}`);
    return [];
  }
}

// 读取状态文件，获取沉船账号列表
function getSunkShipEmails() {
  const sunkShips = new Set();
  try {
    const statusFilePath = path.join(__dirname, config.statusFilePath);
    if (fs.existsSync(statusFilePath)) {
      const fileContent = fs.readFileSync(statusFilePath, 'utf8');
      if (fileContent.trim()) {
        try {
          const statusData = JSON.parse(fileContent);
          // 遍历所有账号状态
          Object.entries(statusData).forEach(([email, data]) => {
            // 检查是否是沉船状态
            if (data.status === '船已沉没') {
              sunkShips.add(email);
              log(`检测到沉船账号: ${email}，将跳过处理`);
            }
          });
        } catch (parseError) {
          log(`解析状态文件出错: ${parseError.message}`);
        }
      }
    }
  } catch (error) {
    log(`读取状态文件出错: ${error.message}`);
  }
  return sunkShips;
}

// 登录函数
async function login(page, email) {
  log(`开始登录: ${email}`, email);
  
  try {
    // 不再需要记录初始状态的截图
    
    // 点击"Sign In"按钮
    log(`查找并点击登录按钮`, email);
    
    // 查找所有按钮
    const buttons = await page.$$('button');
    let signInButtonFound = false;
    
    for (const button of buttons) {
      const buttonText = await button.textContent();
      if (buttonText && buttonText.includes('Sign In')) {
        log(`找到登录按钮: "${buttonText}"`, email);
        await button.click();
        signInButtonFound = true;
        break;
      }
    }
    
    if (!signInButtonFound) {
      log(`未找到登录按钮`, email);
      return false;
    }
    
    // 等待邮箱输入框出现
    log(`等待邮箱输入框...`, email);
    await page.waitForTimeout(3000);
    
    // 查找邮箱输入框
    const emailInputs = await page.$$('input');
    let emailInputFound = false;
    
    for (const input of emailInputs) {
      const placeholder = await input.getAttribute('placeholder');
      if (placeholder && placeholder.includes('email')) {
        log(`找到邮箱输入框`, email);
        await input.fill(email);
        await input.press('Enter');
        emailInputFound = true;
        break;
      }
    }
    
    if (!emailInputFound) {
      log(`未找到邮箱输入框`, email);
      return false;
    }
    
    // 等待密码输入框出现
    log(`等待密码输入框...`, email);
    
    // 检查是否出现"Welcome back"界面，这表示账号未注册
    await page.waitForTimeout(3000);
    const hasWelcomeBack = await page.evaluate(() => {
      return document.body.textContent.includes('Welcome back');
    });
    
    if (hasWelcomeBack) {
      log(`检测到"Welcome back"界面，该账号未注册，跳过处理`, email);
      logErrorToFile(email, '账号未注册');
      return false;
    }
    
    // 如果iframe方法失败，继续尝试原来的方法
    try {
      log(`尝试使用更通用的iframe选择器...`, email);
      
      // 添加页面关闭和导航事件监听
      let pageClosedOrNavigated = false;
      const onClose = () => {
        pageClosedOrNavigated = true;
        log(`页面被关闭`, email);
      };
      
      const onNavigation = (url) => {
        log(`页面导航到: ${url}`, email);
        // 如果导航到了新页面，可能是登录成功
        if (url.includes('adrift.syndicate.io') && !url.includes('login')) {
          pageClosedOrNavigated = true;
          log(`可能已成功登录，导航到新页面: ${url}`, email);
        }
      };
      
      // 监听页面事件
      page.on('close', onClose);
      page.on('framenavigated', frame => {
        if (frame === page.mainFrame()) {
          onNavigation(frame.url());
        }
      });
      
      // 尝试使用更通用的选择器
      const frame = await page.frameLocator('iframe').first();
      if (frame) {
        // 尝试多种选择器查找密码输入框
        const selectors = [
          'input[placeholder="Enter password"]',
          'input[type="password"]',
          'input[aria-label*="password" i]',
          'input'
        ];
        
        for (const selector of selectors) {
          try {
            const passwordInput = await frame.locator(selector).first();
            if (passwordInput) {
              log(`使用选择器 ${selector} 在iframe中找到密码输入框`, email);
              await passwordInput.fill(config.password);
              
              // 尝试点击登录按钮
              try {
                log(`尝试点击登录按钮...`, email);
                
                // 尝试多种方法点击登录按钮
                const loginButtonSelectors = [
                  'button',
                  '[role="button"]:has-text("Login")',
                  'text=Login'
                ];
                
                let buttonClicked = false;
                for (const buttonSelector of loginButtonSelectors) {
                  try {
                    log(`尝试使用选择器: ${buttonSelector}`, email);
                    const loginButton = await frame.locator(buttonSelector).first();
                    if (loginButton) {
                      // 使用evaluate方法点击按钮，避免可能的导航问题
                      await loginButton.evaluate(button => button.click());
                      log(`成功点击登录按钮: ${buttonSelector}`, email);
                      buttonClicked = true;
                      break;
                    }
                  } catch (buttonError) {
                    log(`使用选择器 ${buttonSelector} 点击按钮失败: ${buttonError.message}`, email);
                    continue;
                  }
                }
                
                if (buttonClicked) {
                  // 等待登录完成
                  log(`等待登录完成...`, email);
                  await page.waitForTimeout(10000);
                  
                  // 检查是否登录成功
                  try {
                    // 检查页面是否包含登录成功的标志
                    const isLoggedIn = await page.evaluate(() => {
                      return document.body.textContent.includes('Connected') || 
                             document.body.textContent.includes('Adrift Wallet') || 
                             document.body.textContent.includes('Ship Status') || 
                             document.body.textContent.includes('Repair boat') ||
                             document.body.textContent.includes('Sailing For');
                    });
                    
                    if (isLoggedIn) {
                      log(`登录成功`, email);
                      return true;
                    } else {
                      log(`可能未成功登录，页面内容不包含预期文本`, email);
                      // 继续执行，因为页面可能已经导航但内容尚未完全加载
                    }
                  } catch (checkError) {
                    log(`检查登录状态出错: ${checkError.message}`, email);
                    // 继续执行，不要因为检查出错而中断流程
                  }
                  
                  return true;
                } else {
                  log(`未能找到或点击登录按钮，尝试使用键盘提交`, email);
                  
                  // 尝试使用键盘Enter键提交
                  try {
                    await passwordInput.press('Enter');
                    log(`使用Enter键提交密码`, email);
                    
                    // 等待登录完成
                    log(`等待登录完成...`, email);
                    await page.waitForTimeout(10000);
                    
                    // 检查是否登录成功
                    try {
                      // 检查页面是否包含登录成功的标志
                      const isLoggedIn = await page.evaluate(() => {
                        return document.body.textContent.includes('Connected') || 
                               document.body.textContent.includes('Adrift Wallet') || 
                               document.body.textContent.includes('Ship Status') || 
                               document.body.textContent.includes('Repair boat') ||
                               document.body.textContent.includes('Sailing For');
                      });
                      
                      if (isLoggedIn) {
                        log(`登录成功`, email);
                        return true;
                      } else {
                        log(`可能未成功登录，页面内容不包含预期文本`, email);
                        // 继续执行，因为页面可能已经导航但内容尚未完全加载
                      }
                    } catch (checkError) {
                      log(`检查登录状态出错: ${checkError.message}`, email);
                      // 继续执行，不要因为检查出错而中断流程
                    }
                    
                    return true;
                  } catch (keyboardError) {
                    log(`使用键盘提交密码失败: ${keyboardError.message}`, email);
                  }
                }
              } catch (buttonError) {
                log(`点击登录按钮过程出错: ${buttonError.message}`, email);
              }
            }
          } catch (selectorError) {
            log(`使用选择器 ${selector} 查找密码输入框出错: ${selectorError.message}`, email);
            continue;
          }
        }
      }
    } catch (frameLocatorError) {
      log(`使用frameLocator方法出错: ${frameLocatorError.message}`, email);
    }
    
    // 增加更长的等待时间，并多次尝试
    let passwordInputFound = false;
    let attempts = 0;
    const maxAttempts = 10; // 最多尝试10次
    
    while (attempts < maxAttempts && !passwordInputFound) {
      attempts++;
      log(`尝试查找密码输入框 (${attempts}/${maxAttempts})`, email);
      
      await page.waitForTimeout(3000);
      
      // 使用多种方法查找密码输入框
      passwordInputFound = await page.evaluate(() => {
        // 方法1: 查找type="password"的输入框
        let inputs = Array.from(document.querySelectorAll('input[type="password"]'));
        if (inputs.length > 0) return true;
        
        // 方法2: 查找placeholder包含password的输入框
        inputs = Array.from(document.querySelectorAll('input')).filter(el => {
          const placeholder = el.getAttribute('placeholder');
          return placeholder && (
            placeholder.toLowerCase().includes('password') || 
            placeholder.toLowerCase().includes('密码') ||
            placeholder.toLowerCase().includes('enter password')
          );
        });
        if (inputs.length > 0) return true;
        
        // 方法3: 查找label包含password的输入框
        const passwordLabels = Array.from(document.querySelectorAll('label')).filter(el => 
          el.textContent.toLowerCase().includes('password')
        );
        if (passwordLabels.length > 0) {
          const id = passwordLabels[0].getAttribute('for');
          if (id && document.getElementById(id)) return true;
        }
        
        // 方法4: 查找带有密码相关aria属性的输入框
        inputs = Array.from(document.querySelectorAll('input')).filter(el => {
          const ariaLabel = el.getAttribute('aria-label');
          return ariaLabel && ariaLabel.toLowerCase().includes('password');
        });
        if (inputs.length > 0) return true;
        
        // 方法5: 查找页面上有"Enter password"文本的元素附近的输入框
        const enterPasswordElements = Array.from(document.querySelectorAll('*')).filter(el => 
          el.textContent && el.textContent.trim() === 'Enter password'
        );
        if (enterPasswordElements.length > 0) {
          // 查找这个元素附近的输入框
          const nearbyInputs = document.querySelectorAll('input');
          if (nearbyInputs.length > 0) return true;
        }
        
        return false;
      });
      
      if (passwordInputFound) {
        log(`找到密码输入框（第${attempts}次尝试）`, email);
        break;
      }
      
      // 如果没有找到密码输入框，可能需要按回车键
      if (attempts === 3) {
        log(`尝试按回车键提交邮箱`, email);
        await page.keyboard.press('Enter');
      }
    }
    
    if (passwordInputFound) {
      log(`找到密码输入框，填写密码`, email);
      
      // 尝试使用Playwright的选择器直接定位密码输入框
      try {
        // 尝试多种选择器
        const selectors = [
          'input[type="password"]',
          'input[placeholder*="password" i]',
          'input[placeholder*="Enter password" i]',
          'input[aria-label*="password" i]',
          'text=Enter password >> input'
        ];
        
        for (const selector of selectors) {
          try {
            log(`尝试使用选择器: ${selector}`, email);
            const input = await page.$(selector);
            if (input) {
              log(`使用选择器 ${selector} 找到密码输入框`, email);
              await input.fill(config.password);

              break;
            }
          } catch (e) {
            log(`选择器 ${selector} 未找到元素: ${e.message}`, email);
          }
        }
      } catch (error) {
        log(`使用选择器定位密码输入框失败: ${error.message}`, email);
      }
      
      // 如果选择器方法失败，使用更通用的JavaScript方法输入密码
      await page.evaluate((password) => {
        // 尝试多种方法找到密码输入框
        let passwordInput = null;
        
        // 方法1: type="password"
        const passwordInputs = document.querySelectorAll('input[type="password"]');
        if (passwordInputs.length > 0) {
          passwordInput = passwordInputs[0];
        }
        
        // 方法2: placeholder包含password
        if (!passwordInput) {
          const inputs = Array.from(document.querySelectorAll('input')).filter(el => {
            const placeholder = el.getAttribute('placeholder');
            return placeholder && (
              placeholder.toLowerCase().includes('password') || 
              placeholder.toLowerCase().includes('密码') ||
              placeholder.toLowerCase().includes('enter password')
            );
          });
          if (inputs.length > 0) {
            passwordInput = inputs[0];
          }
        }
        
        // 方法3: 通过label查找
        if (!passwordInput) {
          const passwordLabels = Array.from(document.querySelectorAll('label')).filter(el => 
            el.textContent.toLowerCase().includes('password')
          );
          if (passwordLabels.length > 0) {
            const id = passwordLabels[0].getAttribute('for');
            if (id) {
              passwordInput = document.getElementById(id);
            }
          }
        }
        
        // 方法4: 通过aria属性查找
        if (!passwordInput) {
          const inputs = Array.from(document.querySelectorAll('input')).filter(el => {
            const ariaLabel = el.getAttribute('aria-label');
            return ariaLabel && ariaLabel.toLowerCase().includes('password');
          });
          if (inputs.length > 0) {
            passwordInput = inputs[0];
          }
        }
        
        // 方法5: 查找页面上有"Enter password"文本的元素附近的输入框
        if (!passwordInput) {
          const enterPasswordElements = Array.from(document.querySelectorAll('*')).filter(el => 
            el.textContent && el.textContent.trim() === 'Enter password'
          );
          if (enterPasswordElements.length > 0) {
            // 查找这个元素附近的输入框
            const nearbyInputs = document.querySelectorAll('input');
            if (nearbyInputs.length > 0) {
              passwordInput = nearbyInputs[0]; // 假设第一个输入框是密码框
            }
          }
        }
        
        // 如果找到了密码输入框，填入密码
        if (passwordInput) {
          passwordInput.value = password;
          passwordInput.dispatchEvent(new Event('input', { bubbles: true }));
          passwordInput.dispatchEvent(new Event('change', { bubbles: true }));
          return true;
        }
        
        return false;
      }, config.password);
      
      // 查找登录按钮
      log(`查找登录按钮`, email);
      const loginButtons = await page.$$('button');
      let loginButtonFound = false;
      
      for (const button of loginButtons) {
        const buttonText = await button.textContent();
        if (buttonText && (buttonText.includes('Login') || buttonText.includes('Sign In'))) {
          log(`找到登录按钮: "${buttonText}"`, email);
          await button.click();
          loginButtonFound = true;
          break;
        }
      }
      
      if (!loginButtonFound) {
        log(`未找到登录按钮，尝试按回车键`, email);
        await page.keyboard.press('Enter');
      }
    } else {
      // 检查是否有验证码输入框
      const codeInputs = await page.$$('input');
      let codeInputFound = false;
      
      for (const input of codeInputs) {
        const placeholder = await input.getAttribute('placeholder');
        if (placeholder && (placeholder.includes('code') || placeholder.includes('verification'))) {
          log(`检测到验证码输入框，无法自动完成登录`, email);
          return false;
        }
      }
      
      if (!codeInputFound) {
        log(`未找到密码输入框或验证码输入框`, email);
        return false;
      }
    }
    
    // 等待登录完成
    log(`等待登录完成...`, email);
    await page.waitForTimeout(10000);
    
    // 检查是否登录成功
    log(`检查是否登录成功`, email);
    
    // 查看页面内容
    const pageContent = await page.content();
    const isLoggedIn = pageContent.includes('Connected') || 
                       pageContent.includes('Adrift Wallet') || 
                       pageContent.includes('Ship Status') || 
                       pageContent.includes('Repair boat');
    
    if (isLoggedIn) {
      log(`登录成功，等待页面完全加载...`, email);
      // 登录成功后增加额外的等待时间，确保页面完全加载
      await page.waitForTimeout(15000);
      return true;
    } else {
      log(`登录失败`, email);
      return false;
    }
  } catch (error) {
    log(`登录过程出错: ${error.message}`, email);
    return false;
  }
}

// 检查船只状态
async function checkShipStatus(page, email) {
  try {
    log(`检查船只状态`, email);
    
    // 增加等待时间，确保页面完全加载
    log(`等待页面完全加载...`, email);
    await page.waitForTimeout(10000);
    
    // 检查是否出现"Your ship sank"文本
    const shipSank = await page.evaluate(() => {
      return document.body.textContent.includes('Your ship sank');
    });
    
    if (shipSank) {
      log(`检测到"Your ship sank"，船已沉没，停止处理`, email);
      logErrorToFile(email, '船已沉没');
      return {
        shipSank: true,
        breakdownTime: '',
        safeRepairText: '',
        safeRepairHours: 0,
        hasRepairButton: false
      };
    }
    
    // 首先检查是否有确认按钮，如果有则点击
    log(`检查是否有确认按钮...`, email);
    const hasAcknowledgedButton = await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      return buttons.some(button => button.textContent && button.textContent.includes('Acknowledged'));
    });
    
    if (hasAcknowledgedButton) {
      log(`找到确认按钮，点击它...`, email);
      const acknowledgedButtons = await page.$$('button');
      
      for (const button of acknowledgedButtons) {
        const buttonText = await button.textContent();
        if (buttonText.includes('Acknowledged')) {
          await button.click();
          log(`已点击确认按钮，等待页面更新...`, email);
          // 等待确认按钮点击后的页面更新
          await page.waitForTimeout(5000);
          break;
        }
      }
    }
    
    // 等待船只状态元素出现
    await page.waitForSelector('text="Ship Status"', { timeout: 30000 }).catch(() => {});
    
    // 多次尝试获取船只状态信息
    let shipStatus = null;
    let attempts = 0;
    const maxAttempts = 5; // 最多尝试5次
    let foundCompleteStatus = false;
    
    while (attempts < maxAttempts) {
      attempts++;
      log(`尝试获取船只状态信息 (${attempts}/${maxAttempts})`, email);
      
      // 每次尝试前等待一段时间，让页面有更多时间加载
      await page.waitForTimeout(3000);
      
      // 检查是否有船只状态信息
      shipStatus = await page.evaluate(() => {
        // 尝试查找船只损坏时间
        let breakdownTime = '';
        const breakdownElements = Array.from(document.querySelectorAll('p, div, span')).filter(el => 
          el.textContent && 
          (el.textContent.includes('Ship breaks down in') || el.textContent.includes('breaks down in')) &&
          el.textContent.length < 100
        );
        if (breakdownElements.length > 0) {
          breakdownTime = breakdownElements[0].textContent.trim();
        }
        
        // 尝试查找安全修复时间文本
        let safeRepairText = '';
        // 使用更精确的选择器，只查找包含特定文本的较小元素
        const safeRepairElements = Array.from(document.querySelectorAll('div, p, span')).filter(el => 
          el.textContent && 
          (el.textContent.includes('Safely repair your ship in') || el.textContent.includes('Repair Needed')) && 
          el.textContent.length < 100 // 限制文本长度，避免获取整个页面内容
        );
        if (safeRepairElements.length > 0) {
          safeRepairText = safeRepairElements[0].textContent.trim();
          // 如果找到的是"Repair Needed"，设置一个默认的安全修复时间文本
          if (safeRepairText === 'Repair Needed') {
            safeRepairText = 'Safely repair your ship in 0h 0m';
          }
        }
        
        // 从安全修复文本中提取小时数
        let safeRepairHours = 0;
        if (safeRepairText) {
          // 使用更精确的正则表达式提取时间
          const dayMatch = safeRepairText.match(/Safely repair your ship in (\d+)d (\d+)h/);
          if (dayMatch) {
            safeRepairHours = parseInt(dayMatch[1]) * 24 + parseInt(dayMatch[2]);
          } else {
            const hourMatch = safeRepairText.match(/Safely repair your ship in (\d+)h (\d+)m/);
            if (hourMatch) {
              safeRepairHours = parseInt(hourMatch[1]) + (parseInt(hourMatch[2]) / 60);
            } else if (safeRepairText === 'Safely repair your ship in 0h 0m' || safeRepairText === 'Repair Needed') {
              // 如果是"Repair Needed"或默认文本，设置为0小时
              safeRepairHours = 0;
            }
          }
        }
        
        // 检查是否有修复按钮
        const hasRepairButton = Array.from(document.querySelectorAll('button')).some(el => 
          el.textContent && (el.textContent.includes('Repair boat') || el.textContent.includes('Repair hull'))
        );
        
        // 检查是否出现"Attempting repairs..."文本
        const attemptingRepairs = document.body.textContent.includes('Attempting repairs');
        
        // 检查是否出现"Repair Needed"文本
        const repairNeeded = document.body.textContent.includes('Repair Needed');
        
        // 检查页面内容，用于调试
        const pageContent = document.body.textContent.substring(0, 1000); // 获取前1000个字符用于调试
        
        // 检查是否有登录按钮
        const hasSignInButton = Array.from(document.querySelectorAll('button')).some(el => 
          el.textContent && el.textContent.includes('Sign In')
        );
        
        return {
          breakdownTime,
          safeRepairText,
          safeRepairHours,
          hasRepairButton,
          attemptingRepairs,
          repairNeeded,
          hasSignInButton,
          pageContent // 添加页面内容用于调试
        };
      });
      
      log(`船只状态 (${attempts}/${maxAttempts}): ${shipStatus.breakdownTime || '未知'}, 安全修复时间: ${shipStatus.safeRepairHours.toFixed(1)}小时`, email);
      
      // 如果获取到了完整的状态信息，跳出循环
      if ((shipStatus.breakdownTime && shipStatus.safeRepairText) || 
          (shipStatus.breakdownTime && shipStatus.repairNeeded)) {
        log(`成功获取完整船只状态信息`, email);
        foundCompleteStatus = true;
        break;
      }
      
      // 如果检测到登录按钮，记录日志但继续尝试
      if (shipStatus.hasSignInButton) {
        log(`检测到登录按钮，尝试点击并重新登录 (${attempts}/${maxAttempts})`, email);
        
        // 尝试点击登录按钮
        try {
          const buttons = await page.$$('button');
          let signInButtonFound = false;
          
          for (const button of buttons) {
            const buttonText = await button.textContent();
            if (buttonText && buttonText.includes('Sign In')) {
              log(`找到登录按钮，点击它...`, email);
              await button.click();
              signInButtonFound = true;
              
              // 等待邮箱输入框出现
              await page.waitForTimeout(3000);
              
              // 尝试重新登录
              log(`尝试重新登录...`, email);
              const loginSuccess = await login(page, email);
              if (loginSuccess) {
                log(`重新登录成功，继续尝试获取船只状态`, email);
                // 登录成功后，重置尝试次数，给予更多机会获取船只状态
                attempts = 0;
              } else {
                log(`重新登录失败，继续尝试获取船只状态`, email);
              }
              break;
            }
          }
          
          if (!signInButtonFound) {
            log(`虽然检测到登录按钮，但无法找到可点击的按钮，继续尝试`, email);
          }
        } catch (error) {
          log(`尝试点击登录按钮出错: ${error.message}，继续尝试`, email);
        }
      }
      
      // 尝试点击页面，可能会触发一些隐藏的元素显示
      await page.mouse.click(100, 100).catch(() => {});
      
      // 尝试滚动页面
      await page.evaluate(() => {
        window.scrollBy(0, 100);
      }).catch(() => {});
      
      // 如果尝试次数超过一半且没有检测到登录按钮，尝试刷新页面
      if (attempts > maxAttempts / 2 && !shipStatus.hasSignInButton && !foundCompleteStatus) {
        log(`尝试次数已超过一半，尝试刷新页面获取船只状态`, email);
        try {
          await page.reload({ waitUntil: 'domcontentloaded', timeout: 60000 });
          await page.waitForTimeout(10000); // 等待10秒，确保页面完全加载
          log(`页面已刷新，继续尝试获取船只状态`, email);
        } catch (error) {
          log(`刷新页面出错: ${error.message}，继续尝试`, email);
        }
      }
    }
    
    // 如果多次尝试后仍然无法获取完整信息，返回null触发重新登录
    if (!foundCompleteStatus) {
      log(`多次尝试后仍无法获取完整船只状态，返回null触发重新登录`, email);
      logErrorToFile(email, '无法获取完整船只状态，可能需要重新登录');
      return null;
    }
    
    // 删除调试用的页面内容，避免日志过大
    delete shipStatus.pageContent;
    delete shipStatus.hasSignInButton;
    
    return shipStatus;
  } catch (error) {
    log(`检查船只状态出错: ${error.message}`, email);
    logErrorToFile(email, `检查船只状态出错: ${error.message}`);
    return null;
  }
}

// 修复船只
async function repairShip(page, email) {
  log(`开始修复船只`, email);
  
  try {
    // 点击修复按钮
    log(`点击修复按钮`, email);
    const repairButtons = await page.$$('button');
    let repairButtonFound = false;
    
    for (const button of repairButtons) {
      const buttonText = await button.textContent();
      if (buttonText.includes('Repair boat') || buttonText.includes('Repair hull')) {
        await button.click();
        repairButtonFound = true;
        log(`已点击修复按钮: "${buttonText}"`, email);
        break;
      }
    }
    
    if (!repairButtonFound) {
      log(`未找到修复按钮`, email);
      return false;
    }
    
    // 等待修复界面加载
    log(`等待修复界面加载`, email);
    let patchesFound = false;
    
    // 循环检测修复界面是否加载完成
    for (let i = 0; i < 30; i++) {
      // 检查是否出现"Your ship sank"文本
      const shipSank = await page.evaluate(() => {
        return document.body.textContent.includes('Your ship sank');
      });
      
      if (shipSank) {
        log(`检测到"Your ship sank"，船已沉没，停止处理`, email);
        logErrorToFile(email, '船已沉没');
        return false;
      }
      
      const hasPatchesText = await page.evaluate(() => {
        const elements = Array.from(document.querySelectorAll('div')).filter(el => 
          el.textContent && (el.textContent.includes('Mend the patches') || el.textContent.includes('all of the holes'))
        );
        return elements.length > 0;
      });
      
      if (hasPatchesText) {
        patchesFound = true;
        log(`修复界面已加载 (${i+1}次尝试)`, email);
        break;
      }
      
      // 检查是否出现"Attempting repairs..."文本
      const attemptingRepairs = await page.evaluate(() => {
        return document.body.textContent.includes('Attempting repairs');
      });
      
      if (attemptingRepairs) {
        log(`检测到"Attempting repairs..."，正在修复中，继续等待`, email);
        // 增加等待时间
        await page.waitForTimeout(5000);
      }
      
      log(`等待修复界面加载 (${i+1}/30)`, email);
      await page.waitForTimeout(1000);
    }
    
    if (!patchesFound) {
      log(`修复界面加载失败`, email);
      return false;
    }
    
    // 使用JavaScript自动点击所有洞口
    log(`开始自动点击修复洞口`, email);
    await page.evaluate(() => {
      function clickNextPatch() {
        const holes = Array.from(document.querySelectorAll('.w-12.h-12.rounded-full.border-2.border-foreground.cursor-pointer.transition-colors'))
          .filter(el => !el.className.includes('bg-foreground'));
        
        if (holes.length === 0) {
          console.log('所有洞都已修补！');
          return;
        }
        
        holes[0].click();
        setTimeout(clickNextPatch, 300);
      }
      
      clickNextPatch();
    });
    
    // 等待修复完成 - 增加等待时间，确保所有洞口都被点击
    log(`等待修复完成`, email);
    
    // 增加检查"Your ship sank"的逻辑
    for (let i = 0; i < 50; i++) {
      // 每2秒检查一次是否出现"Your ship sank"
      await page.waitForTimeout(2000);
      
      const shipSank = await page.evaluate(() => {
        return document.body.textContent.includes('Your ship sank');
      });
      
      if (shipSank) {
        log(`检测到"Your ship sank"，船已沉没，停止处理`, email);
        logErrorToFile(email, '船已沉没');
        return false;
      }
      
      // 检查是否出现"Attempting repairs..."文本
      const attemptingRepairs = await page.evaluate(() => {
        return document.body.textContent.includes('Attempting repairs');
      });
      
      if (attemptingRepairs) {
        log(`检测到"Attempting repairs..."，正在修复中，继续等待 (${i+1}/50)`, email);
        continue;
      }
      
      // 检查是否有确认按钮，如果有则表示修复完成
      const hasAcknowledgedButton = await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        return buttons.some(button => button.textContent && button.textContent.includes('Acknowledged'));
      });
      
      if (hasAcknowledgedButton) {
        log(`检测到确认按钮，修复已完成 (${i+1}次检查)`, email);
        break;
      }
    }
    
    // 检查是否有确认按钮
    log(`检查是否有确认按钮`, email);
    let acknowledgedButtonFound = false;
    
    // 尝试多次查找确认按钮，因为可能需要一些时间才会出现
    for (let i = 0; i < 10; i++) {
      const hasAcknowledgedButton = await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        return buttons.some(button => button.textContent && button.textContent.includes('Acknowledged'));
      });
      
      if (hasAcknowledgedButton) {
        acknowledgedButtonFound = true;
        log(`找到确认按钮 (${i+1}次尝试)`, email);
        break;
      }
      
      log(`等待确认按钮出现 (${i+1}/10)`, email);
      await page.waitForTimeout(2000);
    }
    
    if (acknowledgedButtonFound) {
      log(`点击确认按钮`, email);
      const acknowledgedButtons = await page.$$('button');
      
      for (const button of acknowledgedButtons) {
        const buttonText = await button.textContent();
        if (buttonText.includes('Acknowledged')) {
          await button.click();
          log(`已点击确认按钮`, email);
          // 等待确认按钮点击后的页面更新
          await page.waitForTimeout(5000);
          break;
        }
      }
    } else {
      log(`未找到确认按钮，可能修复未完成或界面已更新`, email);
    }
    
    return true;
  } catch (error) {
    log(`修复船只出错: ${error.message}`, email);
    return false;
  }
}

// 处理单个账号
async function processAccount(email) {
  let browser = null;
  let page = null;
  let retryCount = 0;
  const maxRetries = 10; // 增加最大重试次数，确保有足够的尝试机会
  let finalStatus = null;
  
  while (retryCount < maxRetries) {
    try {
      if (retryCount > 0) {
        // 固定重试等待时间
        const waitTime = 5000; // 每次重试等待5秒
        log(`第 ${retryCount + 1} 次尝试处理账号: ${email}，等待 ${waitTime/1000} 秒后重试`, email);
        await new Promise(resolve => setTimeout(resolve, waitTime));
      } else {
        log(`开始处理账号: ${email}`, email);
      }
      
      // 创建浏览器实例
      browser = await chromium.launch(config.browser);
      const context = await browser.newContext({ ignoreHTTPSErrors: true });
      page = await context.newPage();
      
      // 设置超时
      page.setDefaultTimeout(30000);
      
      // 导航到网站
      log(`导航到网站: ${config.adriftUrl}`, email);
      await page.goto(config.adriftUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
      
      // 等待页面加载完成
      await page.waitForTimeout(5000);
      
      // 尝试登录
      const loginSuccess = await login(page, email);
      if (!loginSuccess) {
        log(`登录失败，尝试重新登录`, email);
        logErrorToFile(email, '登录失败');
        
        // 关闭当前浏览器实例
        if (page) await page.close().catch(() => {});
        if (browser) await browser.close().catch(() => {});
        
        retryCount++;
        continue;
      }
      
      // 检查船只状态
      const shipStatus = await checkShipStatus(page, email);
      
      // 如果无法获取船只状态，可能是登录失败或页面未加载完成
      if (!shipStatus) {
        log(`无法获取船只状态，尝试重新登录`, email);
        logErrorToFile(email, '无法获取船只状态');
        
        // 关闭当前浏览器实例
        if (page) await page.close().catch(() => {});
        if (browser) await browser.close().catch(() => {});
        
        retryCount++;
        continue;
      }
      
      // 检查船是否已沉没
      if (shipStatus.shipSank) {
        log(`船已沉没，跳过当前账号`, email);
        // 关闭当前浏览器实例
        if (page) await page.close().catch(() => {});
        if (browser) await browser.close().catch(() => {});
        
        // 返回船只状态
        finalStatus = "船已沉没";
        return { status: finalStatus };
      }
      
      // 判断是否需要修复
      if (shipStatus.safeRepairHours < config.repairThreshold || shipStatus.repairNeeded) {
        if (shipStatus.repairNeeded) {
          log(`检测到"Repair Needed"状态，需要修复`, email);
        } else {
          log(`需要修复: 安全修复时间(${shipStatus.safeRepairHours}小时) < 阈值(${config.repairThreshold}小时)`, email);
        }
        
        // 执行多次修复，直到达标为止
        let repairAttempts = 0;
        const maxRepairAttempts = 10; // 最多修复10次，避免无限循环
        let currentStatus = shipStatus;
        
        while (repairAttempts < maxRepairAttempts) {
          repairAttempts++;
          
          // 检查是否有修复按钮
          if (currentStatus.hasRepairButton) {
            log(`开始第 ${repairAttempts} 次修复`, email);
            const repaired = await repairShip(page, email);
            
            if (repaired) {
              // 修复后再次检查状态
              currentStatus = await checkShipStatus(page, email);
              
              if (!currentStatus) {
                log(`修复后无法获取船只状态，可能需要重新登录`, email);
                break;
              }
              
              log(`第 ${repairAttempts} 次修复完成，修复后状态: ${currentStatus.breakdownTime || '未知'}, 安全修复时间: ${currentStatus.safeRepairHours.toFixed(1)}小时`, email);
              
              // 检查是否达标
              if (currentStatus.safeRepairHours >= config.repairThreshold && !currentStatus.repairNeeded) {
                log(`修复后安全时间(${currentStatus.safeRepairHours}小时)已达到或超过阈值(${config.repairThreshold}小时)，修复完成`, email);
                finalStatus = `修复完成，安全时间: ${currentStatus.safeRepairHours.toFixed(1)}小时`;
                break;
              } else {
                log(`修复后安全时间(${currentStatus.safeRepairHours}小时)仍小于阈值(${config.repairThreshold}小时)，需要继续修复`, email);
                // 继续下一次修复
                continue;
              }
            } else {
              log(`第 ${repairAttempts} 次修复失败`, email);
              break;
            }
          } else {
            // 没有修复按钮，检查是否有确认按钮
            const hasAcknowledgedButton = await page.evaluate(() => {
              const buttons = Array.from(document.querySelectorAll('button'));
              return buttons.some(button => button.textContent && button.textContent.includes('Acknowledged'));
            });
            
            if (hasAcknowledgedButton) {
              log(`找到确认按钮，点击它...`, email);
              const acknowledgedButtons = await page.$$('button');
              
              for (const button of acknowledgedButtons) {
                const buttonText = await button.textContent();
                if (buttonText.includes('Acknowledged')) {
                  await button.click();
                  log(`已点击确认按钮，等待页面更新...`, email);
                  await page.waitForTimeout(5000);
                  
                  // 点击确认按钮后，再次检查状态
                  currentStatus = await checkShipStatus(page, email);
                  
                  if (!currentStatus) {
                    log(`点击确认按钮后无法获取船只状态，可能需要重新登录`, email);
                    break;
                  }
                  
                  log(`点击确认按钮后状态: ${currentStatus.breakdownTime || '未知'}, 安全修复时间: ${currentStatus.safeRepairHours.toFixed(1)}小时`, email);
                  
                  // 如果点击确认按钮后有修复按钮，继续修复
                  if (currentStatus.hasRepairButton) {
                    log(`点击确认按钮后出现了修复按钮，继续修复`, email);
                    continue;
                  } else if (currentStatus.safeRepairHours >= config.repairThreshold && !currentStatus.repairNeeded) {
                    log(`点击确认按钮后安全时间(${currentStatus.safeRepairHours}小时)已达到或超过阈值(${config.repairThreshold}小时)，修复完成`, email);
                    finalStatus = `修复完成，安全时间: ${currentStatus.safeRepairHours.toFixed(1)}小时`;
                    break;
                  } else {
                    log(`点击确认按钮后安全时间(${currentStatus.safeRepairHours}小时)仍小于阈值(${config.repairThreshold}小时)，但没有修复按钮，无法继续修复`, email);
                    finalStatus = `修复未完成，安全时间: ${currentStatus.safeRepairHours.toFixed(1)}小时，无修复按钮`;
                    break;
                  }
                  
                  break;
                }
              }
            } else {
              log(`没有修复按钮也没有确认按钮，无法继续修复`, email);
              finalStatus = `无法修复，安全时间: ${currentStatus.safeRepairHours.toFixed(1)}小时，无修复按钮`;
              break;
            }
          }
        }
        
        if (repairAttempts >= maxRepairAttempts) {
          log(`已达到最大修复尝试次数(${maxRepairAttempts})，停止修复，当前安全修复时间: ${currentStatus.safeRepairHours.toFixed(1)}小时`, email);
          finalStatus = `达到最大修复次数，安全时间: ${currentStatus.safeRepairHours.toFixed(1)}小时`;
        }
      } else {
        log(`船只状态正常，无需修复`, email);
        finalStatus = `状态正常，安全时间: ${shipStatus.safeRepairHours.toFixed(1)}小时`;
      }
      
      // 关闭当前浏览器实例
      if (page) await page.close().catch(() => {});
      if (browser) await browser.close().catch(() => {});
      
      // 返回最终状态
      return { status: finalStatus };
    } catch (error) {
      log(`处理账号出错: ${error.message}`, email);
      logErrorToFile(email, `处理账号出错: ${error.message}`);
      
      // 关闭当前浏览器实例
      if (page) await page.close().catch(() => {});
      if (browser) await browser.close().catch(() => {});
      
      retryCount++;
    }
  }
  
  // 如果所有重试都失败，返回失败状态
  return { status: `处理失败，已尝试 ${maxRetries} 次` };
}

// 主函数
async function main() {
  ensureDirectoriesExist();
  
  while (true) {
    log('开始新一轮账号检查...');
    
    const emails = await readEmails();
    if (emails.length === 0) {
      log('没有可用的邮箱，等待下一轮检查');
    } else {
      // 获取沉船账号列表
      const sunkShips = getSunkShipEmails();
      
      // 过滤掉沉船的账号
      const filteredEmails = emails.filter(email => !sunkShips.has(email));
      
      log(`共有 ${emails.length} 个邮箱，其中 ${emails.length - filteredEmails.length} 个沉船账号将被跳过`);
      
      // 使用队列方式处理账号，确保每个账号都能被处理
      const queue = [...filteredEmails];
      const failedEmails = new Map(); // 记录失败的邮箱及失败次数
      const maxFailAttempts = 5; // 每个账号最多失败5次
      
      // 创建线程池
      const activeThreads = new Set();
      const maxThreads = config.maxConcurrent;
      
      // 处理单个邮箱的函数
      const processEmailWithRetry = async (email) => {
        try {
          // 处理账号
          const result = await processAccount(email);
          if (result && result.status) {
            // 更新状态文件 - 成功
            updateStatusFile(email, result.status, true);
          } else {
            // 更新状态文件 - 成功但无状态
            updateStatusFile(email, "处理完成但无状态信息", true);
          }
          log(`账号 ${email} 处理完成`, email);
          
          // 处理完成后，从队列中取出下一个账号
          processNextEmail();
        } catch (error) {
          // 更新状态文件 - 失败
          updateStatusFile(email, `处理失败: ${error.message}`, false);
          
          // 如果处理失败，增加失败计数
          const failCount = (failedEmails.get(email) || 0) + 1;
          
          if (failCount < maxFailAttempts) {
            failedEmails.set(email, failCount);
            log(`账号 ${email} 处理失败 (${failCount}/${maxFailAttempts})，稍后重试`, email);
            queue.push(email); // 将失败的邮箱重新加入队列
          } else {
            log(`账号 ${email} 已达到最大失败次数 (${maxFailAttempts})，不再重试`, email);
          }
          
          // 无论成功失败，都处理下一个
          processNextEmail();
        } finally {
          // 从活动线程中移除
          activeThreads.delete(email);
        }
      };
      
      // 从队列中取出下一个邮箱进行处理
      const processNextEmail = () => {
        // 如果队列为空且没有活动线程，则结束
        if (queue.length === 0 && activeThreads.size === 0) {
          log('本轮账号处理完成');
          return;
        }
        
        // 如果队列不为空且活动线程数小于最大线程数，启动新线程
        while (queue.length > 0 && activeThreads.size < maxThreads) {
          const email = queue.shift();
          activeThreads.add(email);
          log(`开始处理账号: ${email}，当前活动线程: ${activeThreads.size}/${maxThreads}`, email);
          processEmailWithRetry(email);
        }
      };
      
      // 开始处理
      processNextEmail();
      
      // 等待所有线程完成
      await new Promise((resolve) => {
        const checkInterval = setInterval(() => {
          if (activeThreads.size === 0 && queue.length === 0) {
            clearInterval(checkInterval);
            log('本轮所有账号处理完成');
            resolve();
          }
        }, 5000);
      });
    }
    
    // 计算下一次检查的时间间隔（毫秒）
    const nextCheckInterval = config.checkInterval * 60 * 60 * 1000;
    const nextCheckTime = new Date(Date.now() + nextCheckInterval);
    log(`本轮检查完成，将在 ${nextCheckTime.toISOString()} 进行下一轮检查 (${config.checkInterval} 小时后)`);
    
    // 等待到下一次检查时间
    await new Promise(resolve => setTimeout(resolve, nextCheckInterval));
  }
}

main().catch(error => {
  console.error('发生未处理的错误:', error);
});
