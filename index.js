// remove-br-tags-extension/index.js

// 插件名称，用于localStorage键和路径
const extensionName = "remove-br-tags-extension";
// 插件文件夹路径，相对于SillyTavern的 `public/scripts/extensions/third-party/`
const extensionFolderPath = `scripts/extensions/third-party/${extensionName}`;
// localStorage中存储此插件设置的键名，添加 "-v2" 是为了与可能的旧版本设置区分，避免冲突
const LOCAL_STORAGE_KEY = `st-ext-${extensionName}-settings-v2`;

// 插件的默认设置对象
const defaultSettings = {
    // --- 聊天消息相关规则 ---
    chatHideAllBr: false,          // 布尔值：是否隐藏所有聊天消息中的 <br> 标签
    chatHideLeadingBr: true,       // 布尔值：是否隐藏聊天消息开头的 <br> 标签
    chatMergeConsecutiveBr: true,  // 布尔值：是否合并聊天消息中连续的 <br> 标签 (只保留一个)
    chatSmartExternalBr: false,    // 布尔值：(实验性) 是否智能处理<br>，尝试保留被HTML块级元素包裹的，隐藏“裸露”的

    // --- 全局规则 ---
    globalHideAllBr: false,        // 布尔值：是否隐藏整个SillyTavern界面中的所有 <br> 标签 (谨慎使用!)
};

// --- 用于DOM操作时记录<br>原始状态的属性名 ---
// 存储<br>在被隐藏前的原始display样式
const ORIGINAL_DISPLAY_ATTR = 'data-original-display';
// 标记一个<br>是否已被本插件的当前规则处理周期处理过
const PROCESSED_BY_PLUGIN_ATTR = 'data-br-processed';
// 记录是哪个具体规则导致<br>被隐藏或豁免，便于调试和复杂逻辑
const HIDDEN_BY_RULE_ATTR = 'data-br-hidden-by';

// --- 插件当前的设置状态，从localStorage加载或使用默认值 ---
let currentSettings = loadSettingsFromLocalStorage();

/**
 * 从localStorage加载插件的设置。
 * 如果localStorage中没有找到设置，或解析失败，则返回默认设置。
 * @returns {object} 加载到的或默认的插件设置对象。
 */
function loadSettingsFromLocalStorage() {
    try {
        const storedSettings = localStorage.getItem(LOCAL_STORAGE_KEY);
        if (storedSettings) {
            const parsedSettings = JSON.parse(storedSettings);
            // 合并已存储的设置和默认设置，确保所有键都存在
            // (例如插件更新后新增了默认键，而已存储的设置中没有)
            return { ...defaultSettings, ...parsedSettings };
        }
    } catch (error) {
        console.error(`[${extensionName}] 从localStorage加载设置时出错:`, error);
        // 如果解析失败，也返回默认设置，避免插件崩溃
    }
    return { ...defaultSettings }; // 返回默认设置的一个副本
}

/**
 * 将当前的插件设置保存到localStorage。
 * @param {object} settings 要保存的设置对象。
 */
function saveSettingsToLocalStorage(settings) {
    try {
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(settings));
        // console.log(`[${extensionName}] 设置已保存到localStorage:`, settings);
    } catch (error) {
        console.error(`[${extensionName}] 保存设置到localStorage时出错:`, error);
        if (typeof toastr !== 'undefined') {
            toastr.error(`插件 ${extensionName} 保存设置失败。`, "存储错误");
        }
    }
}

/**
 * 恢复所有被本插件修改过显示状态的 <br> 标签到其原始状态。
 * 这个函数在每次应用新规则之前被调用，以确保一个干净的DOM环境。
 */
function revertAllBrModifications() {
    // 选取所有被本插件处理过的<br>标签
    document.querySelectorAll(`br[${PROCESSED_BY_PLUGIN_ATTR}]`).forEach(br => {
        const originalDisplay = br.getAttribute(ORIGINAL_DISPLAY_ATTR);
        br.style.display = originalDisplay || ''; // 恢复原始display，如果没存则恢复默认（通常是block或inline）
        // 移除插件添加的追踪属性
        br.removeAttribute(ORIGINAL_DISPLAY_ATTR);
        br.removeAttribute(PROCESSED_BY_PLUGIN_ATTR);
        br.removeAttribute(HIDDEN_BY_RULE_ATTR);
    });
    // console.log(`[${extensionName}] 所有BR标签的修改已被恢复。`);
}

/**
 * 辅助函数：将指定的 <br> 元素标记为隐藏，并记录相关信息。
 * @param {HTMLElement} brElement 要隐藏的 <br> 元素。
 * @param {string} ruleName 导致此 <br> 被隐藏的规则名称。
 */
function markBrAsHidden(brElement, ruleName) {
    // 安全检查：确保brElement是有效的HTML元素
    if (!brElement || typeof brElement.hasAttribute !== 'function') {
        // console.warn(`[${extensionName}] markBrAsHidden: 无效的brElement传入 (rule: ${ruleName})`, brElement);
        return;
    }

    // 如果该<br>尚未被本轮处理过
    if (!brElement.hasAttribute(PROCESSED_BY_PLUGIN_ATTR)) {
        const currentDisplay = window.getComputedStyle(brElement).display;
        // 只有当它当前不是'none'时才记录原始display，避免错误覆盖
        if (currentDisplay !== 'none') {
            brElement.setAttribute(ORIGINAL_DISPLAY_ATTR, currentDisplay);
        }
        brElement.style.display = 'none'; // 隐藏<br>
        brElement.setAttribute(PROCESSED_BY_PLUGIN_ATTR, 'true'); // 标记为已处理
        brElement.setAttribute(HIDDEN_BY_RULE_ATTR, ruleName);   // 记录隐藏原因
    } else if (brElement.style.display !== 'none') {
        // 如果已被处理过，但由于某种原因（如被其他规则豁免后又被此规则隐藏）当前可见
        brElement.style.display = 'none'; // 再次隐藏
        brElement.setAttribute(HIDDEN_BY_RULE_ATTR, ruleName); // 更新隐藏原因
    }
}

/**
 * 辅助函数：将指定的 <br> 元素标记为可见（通常是恢复其原始显示状态）。
 * @param {HTMLElement} brElement 要设为可见的 <br> 元素。
 * @param {string} ruleName 导致此 <br> 被设为可见（豁免/保留）的规则名称。
 */
function markBrAsVisible(brElement, ruleName) {
    // 安全检查
    if (!brElement || typeof brElement.hasAttribute !== 'function') {
        // console.warn(`[${extensionName}] markBrAsVisible: 无效的brElement传入 (rule: ${ruleName})`, brElement);
        return;
    }

    // 仅当它之前被本插件隐藏了，我们才需要“恢复”它
    if (brElement.hasAttribute(PROCESSED_BY_PLUGIN_ATTR) && brElement.style.display === 'none') {
        const originalDisplay = brElement.getAttribute(ORIGINAL_DISPLAY_ATTR);
        brElement.style.display = originalDisplay || ''; // 恢复显示
        brElement.setAttribute(HIDDEN_BY_RULE_ATTR, `exempted_by_${ruleName}`); // 标记为被豁免
    } else if (!brElement.hasAttribute(PROCESSED_BY_PLUGIN_ATTR)) {
        // 如果它本来就可见，并且还未被处理过，我们仅标记它已被处理并被某规则“保留”
        brElement.setAttribute(PROCESSED_BY_PLUGIN_ATTR, 'true');
        brElement.setAttribute(HIDDEN_BY_RULE_ATTR, `kept_by_${ruleName}`);
    }
}

/**
 * 核心函数：根据当前设置，遍历DOM并应用所有<br>处理规则。
 */
function applyBrRules() {
    // console.time(`[${extensionName}] applyBrRules 执行耗时`); // 用于性能分析
    revertAllBrModifications(); // 首先，清除所有之前的修改，从干净状态开始
    const settings = currentSettings; // 获取当前激活的设置

    // --- 规则1: 全局隐藏所有 <br> (最高优先级) ---
    if (settings.globalHideAllBr) {
        document.querySelectorAll('body br').forEach(br => markBrAsHidden(br, 'globalHideAllBr'));
        // console.timeEnd(`[${extensionName}] applyBrRules 执行耗时`);
        // console.log(`[${extensionName}] 规则应用: globalHideAllBr`);
        return; // 如果全局隐藏，则不执行后续针对聊天的规则
    }

    // --- 针对聊天消息的 <br> 处理 ---
    // 定义SillyTavern聊天消息容器的CSS选择器 (可能需要根据ST版本或主题调整)
    const chatMessageSelectors = [
        '.mes_text',                        // 主要的聊天文本容器
        '.mes .force-user-msg .mes_text',   // 针对强制用户消息样式
        '.mes .force-char-msg .mes_text',   // 针对强制角色消息样式
        'div[id^="chatMessage"] .mes_text', // 另一种可能的聊天消息结构
        '.message-content',                 // 常见的消息内容类名
    ];

    // 遍历所有匹配到的聊天容器
    document.querySelectorAll(chatMessageSelectors.join(', ')).forEach(chatContainer => {
        // --- 规则1.1: 隐藏此聊天容器内的所有 <br> (如果启用) ---
        if (settings.chatHideAllBr) {
            chatContainer.querySelectorAll('br').forEach(br => markBrAsHidden(br, 'chatHideAllBr'));
            // console.log(`[${extensionName}] 规则应用到容器 ${chatContainer.id || chatContainer.className}: chatHideAllBr`);
            return; // 此聊天容器处理完毕，跳到下一个容器
        }

        // 获取此容器内所有的<br>元素，并转换为真实数组方便操作
        const brNodesInContainer = Array.from(chatContainer.querySelectorAll('br'));

        // --- 规则1.2: 隐藏聊天消息开头的 <br> (当chatHideAllBr为false时) ---
        if (settings.chatHideLeadingBr) {
            let firstNode = chatContainer.firstChild;
            // 跳过消息开头可能存在的空白文本节点
            while (firstNode && firstNode.nodeType === Node.TEXT_NODE && firstNode.textContent.trim() === '') {
                firstNode = firstNode.nextSibling;
            }
            // 如果第一个非空节点是<br>，则隐藏它
            if (firstNode && firstNode.nodeName === 'BR') {
                markBrAsHidden(firstNode, 'chatHideLeadingBr');
            }
        }

        // --- 规则1.3: 合并聊天消息中连续的 <br> (当chatHideAllBr为false时) ---
        if (settings.chatMergeConsecutiveBr) {
            for (let i = 0; i < brNodesInContainer.length; i++) {
                const currentBr = brNodesInContainer[i];
                // 安全检查，并跳过已被其他规则隐藏的<br>（它不能作为连续序列的“第一个保留者”）
                if (!currentBr || (currentBr.style.display === 'none' && currentBr.hasAttribute(PROCESSED_BY_PLUGIN_ATTR))) {
                    continue;
                }

                let nextSignificantNode = currentBr.nextSibling;
                // 查找紧跟在currentBr后面的、连续的<br>标签（中间可以有空白文本节点）
                while (nextSignificantNode) {
                    if (nextSignificantNode.nodeType === Node.TEXT_NODE && nextSignificantNode.textContent.trim() === '') {
                        nextSignificantNode = nextSignificantNode.nextSibling; // 跳过空白文本
                        continue;
                    }
                    // 如果下一个有效节点是<br>，则隐藏它，并继续查找下一个
                    if (nextSignificantNode.nodeName === 'BR') {
                        markBrAsHidden(nextSignificantNode, 'chatMergeConsecutiveBr');
                        nextSignificantNode = nextSignificantNode.nextSibling;
                    } else {
                        break; // 不是<br>，连续序列结束
                    }
                }
            }
        }

        // --- 规则1.4: 智能保留被包裹的<br> / 隐藏裸露的<br> (实验性, 当chatHideAllBr为false时) ---
        if (settings.chatSmartExternalBr) {
            // 定义哪些HTML标签包裹<br>时，该<br>倾向于被认为是“必要的”
            const significantWrappers = ['P', 'DIV', 'LI', 'BLOCKQUOTE', 'PRE', 'TD', 'TH', 'SECTION', 'ARTICLE', 'ASIDE', 'MAIN', 'HEADER', 'FOOTER', 'NAV', 'SPAN'];

            brNodesInContainer.forEach(br => {
                if (!br) return; // 安全检查

                let parent = br.parentElement;
                let isWrapped = false; // 标记此<br>是否被significantWrappers中的标签包裹
                while (parent && parent !== chatContainer) { // 向上遍历父节点直到聊天容器边界
                    if (significantWrappers.includes(parent.nodeName.toUpperCase())) {
                        isWrapped = true;
                        break;
                    }
                    parent = parent.parentElement;
                }

                if (isWrapped) { // --- 如果<br>被包裹 ---
                    // 检查它是否当前被隐藏（可能被Leading或Merge规则隐藏）
                    if (br.style.display === 'none' && br.hasAttribute(PROCESSED_BY_PLUGIN_ATTR)) {
                        // 只有当它不是被本规则的“隐藏裸露部分”隐藏时，才考虑豁免，避免逻辑循环
                        const hiddenByThisRuleHideNakedPart = br.getAttribute(HIDDEN_BY_RULE_ATTR) === 'chatSmartExternalBr_hide_naked';
                        // 或者，如果它被开头的或合并规则隐藏了，现在智能规则决定豁免它
                        const hiddenByLeadingOrMerge = br.getAttribute(HIDDEN_BY_RULE_ATTR) === 'chatHideLeadingBr' || br.getAttribute(HIDDEN_BY_RULE_ATTR) === 'chatMergeConsecutiveBr';

                        if (!hiddenByThisRuleHideNakedPart || hiddenByLeadingOrMerge) {
                           markBrAsVisible(br, 'chatSmartExternalBr_exempt'); // 豁免，使其可见
                        }
                    } else if (br.style.display !== 'none' && !br.hasAttribute(PROCESSED_BY_PLUGIN_ATTR)) {
                        // 如果它本来就可见，且未被处理，则标记为被本规则“保留”
                        markBrAsVisible(br, 'chatSmartExternalBr_kept');
                    }
                } else { // --- 如果<br>是“裸露”的 (未被significantWrappers包裹) ---
                    if (br.style.display !== 'none') { // 只有当它当前可见时才考虑隐藏
                        // 检查它是否已被其他规则明确标记为“豁免”或“保留”
                        const keptOrExemptedByOther = br.hasAttribute(HIDDEN_BY_RULE_ATTR) &&
                                                    (br.getAttribute(HIDDEN_BY_RULE_ATTR).includes('exempt') ||
                                                     br.getAttribute(HIDDEN_BY_RULE_ATTR).includes('kept_by_chatSmartExternalBr')); // 修正：不应包含kept_by_chatSmartExternalBr_kept
                        const keptBySmartExternalKept = br.hasAttribute(HIDDEN_BY_RULE_ATTR) && br.getAttribute(HIDDEN_BY_RULE_ATTR) === 'kept_by_chatSmartExternalBr_kept';


                        // 如果没有被其他规则豁免或被本规则的保留部分保留，则隐藏这个裸露的<br>
                        if (!keptOrExemptedByOther || keptBySmartExternalKept) { // 这里的逻辑可能需要微调
                             markBrAsHidden(br, 'chatSmartExternalBr_hide_naked');
                        }
                    }
                }
            });
        }
    });
    // console.timeEnd(`[${extensionName}] applyBrRules 执行耗时`);
    // console.log(`[${extensionName}] 所有规则应用完毕。`);
}

/**
 * 更新设置界面中的复选框状态，以匹配当前加载的插件设置。
 */
function updateUIFromSettings() {
    const s = currentSettings;
    // 确保jQuery已加载，`$`是可用的
    $('#st-br-chat-hide-all').prop('checked', s.chatHideAllBr);
    $('#st-br-chat-hide-leading').prop('checked', s.chatHideLeadingBr);
    $('#st-br-chat-merge-consecutive').prop('checked', s.chatMergeConsecutiveBr);
    $('#st-br-chat-smart-external').prop('checked', s.chatSmartExternalBr);
    $('#st-br-global-hide-all').prop('checked', s.globalHideAllBr);
    // console.log(`[${extensionName}] UI设置已从当前配置更新。`);
}

/**
 * 当设置界面中的任何一个复选框状态改变时被调用。
 * @param {Event} event - DOM事件对象。
 */
function onSettingsChange(event) {
    const targetId = event.target.id; // 获取被点击的复选框的ID
    const checked = Boolean(event.target.checked); // 获取复选框的选中状态

    // 根据ID更新currentSettings对象中对应的属性
    switch (targetId) {
        case 'st-br-chat-hide-all': currentSettings.chatHideAllBr = checked; break;
        case 'st-br-chat-hide-leading': currentSettings.chatHideLeadingBr = checked; break;
        case 'st-br-chat-merge-consecutive': currentSettings.chatMergeConsecutiveBr = checked; break;
        case 'st-br-chat-smart-external':
            currentSettings.chatSmartExternalBr = checked;
            if (checked && typeof toastr !== 'undefined') { // 如果toastr可用，显示提示
                toastr.info("“智能保留/隐藏”规则是实验性的，效果可能因内容而异。", "实验性功能提示", { timeOut: 5000 });
            }
            break;
        case 'st-br-global-hide-all':
            currentSettings.globalHideAllBr = checked;
            if (checked && typeof toastr !== 'undefined') {
                toastr.warning("全局隐藏 <br> 已启用。如果界面显示异常，请禁用此选项。", "BR标签控制警告", { timeOut: 7000, preventDuplicates: true });
            }
            break;
        default:
            // console.warn(`[${extensionName}] 未知的设置ID发生改变: ${targetId}`);
            return; // 如果ID未知，则不执行后续操作
    }

    saveSettingsToLocalStorage(currentSettings); // 将更新后的设置保存到localStorage
    applyBrRules(); // 立即应用新的规则，以便用户能看到效果
}

// --- MutationObserver: 监听聊天内容的动态变化，并自动应用规则 ---
let chatObserver = null; // MutationObserver实例
/**
 * 初始化并启动MutationObserver来监听聊天区域的DOM变化。
 * 当新的聊天消息被添加到DOM时，会自动（经过防抖处理后）重新应用<br>处理规则。
 */
function observeChatMessages() {
    // 使用防抖函数包装applyBrRules，避免在DOM频繁更新时过于频繁地执行，影响性能
    const debouncedApplyBrRules = debounce(applyBrRules, 300); // 300毫秒延迟

    // 尝试多种选择器来定位SillyTavern的聊天消息显示区域
    const chatAreaSelectors = ['#chat', '.chat-messages-container', '#chat-scroll-container', 'div[class*="chatlog"]', 'body'];
    let mainChatArea = null;
    for (const selector of chatAreaSelectors) {
        mainChatArea = document.querySelector(selector);
        if (mainChatArea) break; // 找到第一个匹配的就使用
    }

    if (!mainChatArea) {
        console.warn(`[${extensionName}] 未能找到合适的聊天区域进行监听。将回退到监听document.body，这可能效率较低。`);
        mainChatArea = document.body; // 最后的回退方案
    }
    // console.log(`[${extensionName}] MutationObserver将监听以下目标:`, mainChatArea);

    // 如果已存在一个观察者实例，先断开它
    if (chatObserver) {
        chatObserver.disconnect();
    }

    // 创建新的MutationObserver实例
    chatObserver = new MutationObserver((mutationsList) => { // 当观察到DOM变化时执行的回调
        let relevantMutation = false; // 标记本次DOM变化是否与新聊天消息相关
        for (const mutation of mutationsList) {
            // 我们主要关心childList类型的变化（即有节点被添加或删除）
            if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
                // 遍历所有被添加的节点
                for (const node of mutation.addedNodes) {
                    if (node.nodeType === Node.ELEMENT_NODE) { // 确保是元素节点
                        // 检查添加的节点是否是聊天消息的典型容器（如class为'mes'或包含'.mes_text'）
                        if (node.matches && (node.matches('.mes') || node.querySelector('.mes_text') || node.classList.contains('message'))) {
                            relevantMutation = true;
                            break; // 找到一个相关变化就足够了
                        }
                    }
                }
            }
            if (relevantMutation) break;
        }

        // 如果检测到相关的聊天内容变化
        if (relevantMutation) {
            // console.log(`[${extensionName}] 检测到聊天内容变化，将重新应用BR规则 (防抖处理后)。`);
            debouncedApplyBrRules(); // 调用防抖包装后的applyBrRules
        }
    });

    // 开始观察目标区域的DOM变化：监听子节点列表的变化，并递归到子树
    chatObserver.observe(mainChatArea, { childList: true, subtree: true });
    // console.log(`[${extensionName}] MutationObserver已启动。`);
}

/**
 * 防抖函数：确保一个函数在一定时间内只被执行一次，即使它被连续触发多次。
 * @param {Function} func 要执行的函数。
 * @param {number} wait 等待的毫秒数。
 * @returns {Function} 包装后的防抖函数。
 */
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// --- 尝试动态导入SillyTavern的事件系统，作为MutationObserver的补充 ---
// 这部分代码会尝试加载SillyTavern主脚本中的eventSource和event_types，
// 以便监听SillyTavern自身的聊天更新事件，从而更可靠地触发规则应用。
// 使用try-catch和动态import()来处理可能的加载失败，避免插件整体崩溃。
let eventSourceInstance, eventTypesInstance; // 使用不同的变量名以避免与全局可能的冲突
try {
    import('../../../../script.js') // 尝试从SillyTavern的标准路径导入
        .then(module => {
            eventSourceInstance = module.eventSource;
            eventTypesInstance = module.event_types;

            if (eventSourceInstance && eventTypesInstance) {
                const debouncedApplyBrRulesOnEvent = debounce(applyBrRules, 400); // 稍长一点的延迟
                // 监听SillyTavern的聊天更新和消息滑动事件
                eventSourceInstance.on(eventTypesInstance.CHAT_UPDATED, debouncedApplyBrRulesOnEvent);
                eventSourceInstance.on(eventTypesInstance.MESSAGE_SWIPED, debouncedApplyBrRulesOnEvent);
                // console.log(`[${extensionName}] 已成功附加到SillyTavern的事件监听器。`);
            }
        })
        .catch(err => {
            // console.warn(`[${extensionName}] 从SillyTavern的script.js动态导入eventSource/event_types失败:`, err.message);
        });
} catch (e) {
    // console.warn(`[${extensionName}] 尝试动态导入SillyTavern事件系统时发生错误:`, e.message);
}


// --- jQuery的 $(document).ready() 等效写法，插件初始化入口点 ---
// 使用 jQuery(async () => { ... }) 来确保DOM加载完成后执行异步初始化操作。
jQuery(async () => {
    try {
        // 1. 加载设置界面的HTML内容
        const settingsHtmlPath = `${extensionFolderPath}/settings.html`;
        // console.log(`[${extensionName}] 正在从以下路径获取设置界面的HTML: ${settingsHtmlPath}`);
        const settingsHtml = await $.get(settingsHtmlPath); // 使用jQuery的get方法异步加载HTML
        // console.log(`[${extensionName}] 设置界面的HTML已成功获取。`);

        // 2. 将加载到的HTML附加到SillyTavern的扩展设置区域
        //    尝试SillyTavern标准的扩展设置容器ID "#extensions_settings"
        const $extensionsSettingsContainer = $("#extensions_settings");
        if ($extensionsSettingsContainer.length) { // 如果容器存在
            $extensionsSettingsContainer.append(settingsHtml); // 附加HTML
            // console.log(`[${extensionName}] 设置界面HTML已附加到 #extensions_settings。`);
        } else {
            // 如果标准容器未找到，给出警告。此时设置面板可能无法正确显示。
            console.warn(`[${extensionName}] 未找到 #extensions_settings 容器。设置面板可能无法正确显示或附加。`);
            // 最后的手段是附加到body，但这通常会导致显示问题，不推荐。
            // $('body').append(settingsHtml);
        }

        // 3. 为设置界面中的控件绑定事件监听器
        //    使用事件委托，确保即使HTML是动态添加的，事件也能正确绑定。
        //    监听 settings.html 中根div (假设其ID为 remove-br-tags-extension-settings-container) 内的所有checkbox的input事件
        //    或者更通用的类选择器 .br-tags-control-settings
        $(document).on('input', '#remove-br-tags-extension-settings-container input[type="checkbox"]', onSettingsChange);
        $(document).on('input', '.br-tags-control-settings input[type="checkbox"]', onSettingsChange); // 再加一个通用的，以防ID没加对

        // 为“立即应用规则”按钮绑定点击事件
        $(document).on('click', '#st-br-apply-rules-now', () => {
            if (typeof toastr !== 'undefined') { // 如果toastr可用
                toastr.info("正在手动应用BR处理规则...", extensionName, { timeOut: 1000 });
            }
            applyBrRules(); // 调用核心规则应用函数
        });

        // 4. 加载持久化的设置
        currentSettings = loadSettingsFromLocalStorage();
        // 5. 根据加载的设置更新UI（复选框的选中状态）
        updateUIFromSettings();
        // 6. 在插件首次加载时，立即应用一次规则
        applyBrRules();

        // 7. 启动MutationObserver来监听后续的聊天消息动态添加
        observeChatMessages();

        console.log(`[${extensionName}] 插件初始化成功。`);

    } catch (error) { // 捕获初始化过程中可能发生的任何严重错误
        console.error(`[${extensionName}] 插件初始化过程中发生严重错误:`, error);
        // 如果toastr可用，显示一个持久的错误提示
        if (typeof toastr !== 'undefined') {
            toastr.error(`插件 "${extensionName}" 初始化失败。详情请查看浏览器控制台。`, "插件错误", { timeOut: 0 }); // timeOut: 0 表示不自动消失
        }
        // 使用alert作为最后的手段，确保用户能看到错误信息，特别是如果UI都加载不出来
        alert(`插件 "${extensionName}" 初始化时发生严重错误，可能导致功能异常或无法显示设置面板。请按F12打开浏览器控制台，查看详细的错误信息。`);
    }
});
