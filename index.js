// remove-br-tags-extension/index.js

// 插件名称，用于localStorage键和路径
const extensionName = "remove-br-tags-extension";
// 插件文件夹路径，相对于SillyTavern的 `public/scripts/extensions/third-party/`
const extensionFolderPath = `scripts/extensions/third-party/${extensionName}`;
// localStorage中存储此插件设置的键名，添加 "-v2" 是为了与可能的旧版本设置区分，避免冲突
const LOCAL_STORAGE_KEY = `st-ext-${extensionName}-settings-v2`; // 或者可以升级到v3如果之前的v2测试不理想

// 插件的默认设置对象
const defaultSettings = {
    // --- 聊天消息相关规则 ---
    chatHideAllBr: false,
    chatHideLeadingBr: true,
    chatMergeConsecutiveBr: true,
    chatSmartExternalBr: false,

    // --- 全局规则 ---
    globalHideAllBr: false,
};

// --- 用于DOM操作时记录<br>原始状态的属性名 ---
const ORIGINAL_DISPLAY_ATTR = 'data-original-display';
const PROCESSED_BY_PLUGIN_ATTR = 'data-br-processed';
const HIDDEN_BY_RULE_ATTR = 'data-br-hidden-by';

// --- 插件当前的设置状态，从localStorage加载或使用默认值 ---
let currentSettings = loadSettingsFromLocalStorage();
let isApplyingRules = false; // 防止applyBrRules重入的标志

/**
 * 从localStorage加载插件的设置。
 * @returns {object} 加载到的或默认的插件设置对象。
 */
function loadSettingsFromLocalStorage() {
    try {
        const storedSettings = localStorage.getItem(LOCAL_STORAGE_KEY);
        if (storedSettings) {
            const parsedSettings = JSON.parse(storedSettings);
            return { ...defaultSettings, ...parsedSettings };
        }
    } catch (error) {
        console.error(`[${extensionName}] 从localStorage加载设置时出错:`, error);
    }
    return { ...defaultSettings };
}

/**
 * 将当前的插件设置保存到localStorage。
 * @param {object} settings 要保存的设置对象。
 */
function saveSettingsToLocalStorage(settings) {
    try {
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(settings));
    } catch (error) {
        console.error(`[${extensionName}] 保存设置到localStorage时出错:`, error);
        if (typeof toastr !== 'undefined') {
            toastr.error(`插件 ${extensionName} 保存设置失败。`, "存储错误");
        }
    }
}

/**
 * 恢复所有被本插件修改过显示状态的 <br> 标签到其原始状态。
 */
function revertAllBrModifications() {
    document.querySelectorAll(`br[${PROCESSED_BY_PLUGIN_ATTR}]`).forEach(br => {
        const originalDisplay = br.getAttribute(ORIGINAL_DISPLAY_ATTR);
        br.style.display = originalDisplay || '';
        br.removeAttribute(ORIGINAL_DISPLAY_ATTR);
        br.removeAttribute(PROCESSED_BY_PLUGIN_ATTR);
        br.removeAttribute(HIDDEN_BY_RULE_ATTR);
    });
}

/**
 * 辅助函数：将指定的 <br> 元素标记为隐藏。
 * @param {HTMLElement} brElement 要隐藏的 <br> 元素。
 * @param {string} ruleName 导致此 <br> 被隐藏的规则名称。
 */
function markBrAsHidden(brElement, ruleName) {
    if (!brElement || typeof brElement.hasAttribute !== 'function') return;

    if (!brElement.hasAttribute(PROCESSED_BY_PLUGIN_ATTR) || brElement.style.display !== 'none') {
        const currentDisplay = window.getComputedStyle(brElement).display;
        if (currentDisplay !== 'none' && !brElement.hasAttribute(ORIGINAL_DISPLAY_ATTR)) { // 只有当还没有存原始值时才存
            brElement.setAttribute(ORIGINAL_DISPLAY_ATTR, currentDisplay);
        }
        brElement.style.display = 'none';
        brElement.setAttribute(PROCESSED_BY_PLUGIN_ATTR, 'true');
        brElement.setAttribute(HIDDEN_BY_RULE_ATTR, ruleName);
    } else if (brElement.style.display !== 'none') { // 已处理但当前可见，再次隐藏
        brElement.style.display = 'none';
        brElement.setAttribute(HIDDEN_BY_RULE_ATTR, ruleName); // 更新规则
    }
}

/**
 * 辅助函数：将指定的 <br> 元素标记为可见。
 * @param {HTMLElement} brElement 要设为可见的 <br> 元素。
 * @param {string} ruleName 导致此 <br> 被设为可见的规则名称。
 */
function markBrAsVisible(brElement, ruleName) {
    if (!brElement || typeof brElement.hasAttribute !== 'function') return;

    if (brElement.hasAttribute(PROCESSED_BY_PLUGIN_ATTR) && brElement.style.display === 'none') {
        const originalDisplay = brElement.getAttribute(ORIGINAL_DISPLAY_ATTR);
        brElement.style.display = originalDisplay || '';
        brElement.setAttribute(HIDDEN_BY_RULE_ATTR, `exempted_by_${ruleName}`);
    } else if (!brElement.hasAttribute(PROCESSED_BY_PLUGIN_ATTR)) {
        brElement.setAttribute(PROCESSED_BY_PLUGIN_ATTR, 'true');
        brElement.setAttribute(HIDDEN_BY_RULE_ATTR, `kept_by_${ruleName}`);
    }
}

/**
 * 核心函数：应用<br>处理规则。
 */
function applyBrRules(source = "unknown") {
    // console.log(`[${extensionName}] applyBrRules triggered by: ${source}. IsApplying: ${isApplyingRules}`);
    if (isApplyingRules) {
        // console.log(`[${extensionName}] applyBrRules call skipped due to re-entrancy guard.`);
        return;
    }
    isApplyingRules = true;

    // console.time(`[${extensionName}] applyBrRules (${source})`);
    revertAllBrModifications();
    const settings = currentSettings;

    try { // 包裹整个规则应用逻辑，确保isApplyingRules能被重置
        if (settings.globalHideAllBr) {
            document.querySelectorAll('body br').forEach(br => markBrAsHidden(br, 'globalHideAllBr'));
            // console.timeEnd(`[${extensionName}] applyBrRules (${source})`);
            isApplyingRules = false;
            return;
        }

        const chatMessageSelectors = [
            '.mes_text',
            '.mes .force-user-msg .mes_text',
            '.mes .force-char-msg .mes_text',
            'div[id^="chatMessage"] .mes_text', // 针对特定DOM ID模式
            '.message-content', // 通用消息内容类
            '.chitchat-text', // 某些主题可能使用
        ];

        document.querySelectorAll(chatMessageSelectors.join(', ')).forEach(chatContainer => {
            if (settings.chatHideAllBr) {
                chatContainer.querySelectorAll('br').forEach(br => markBrAsHidden(br, 'chatHideAllBr'));
                return;
            }

            const brNodesInContainer = Array.from(chatContainer.querySelectorAll('br'));

            if (settings.chatHideLeadingBr) {
                let firstNode = chatContainer.firstChild;
                while (firstNode && firstNode.nodeType === Node.TEXT_NODE && firstNode.textContent.trim() === '') {
                    firstNode = firstNode.nextSibling;
                }
                if (firstNode && firstNode.nodeName === 'BR') {
                    markBrAsHidden(firstNode, 'chatHideLeadingBr');
                }
            }

            if (settings.chatMergeConsecutiveBr) {
                for (let i = 0; i < brNodesInContainer.length; i++) {
                    const currentBr = brNodesInContainer[i];
                    if (!currentBr || (currentBr.style.display === 'none' && currentBr.hasAttribute(PROCESSED_BY_PLUGIN_ATTR))) {
                        continue;
                    }

                    let nextSignificantNode = currentBr.nextSibling;
                    while (nextSignificantNode) {
                        if (nextSignificantNode.nodeType === Node.TEXT_NODE && nextSignificantNode.textContent.trim() === '') {
                            nextSignificantNode = nextSignificantNode.nextSibling;
                            continue;
                        }
                        if (nextSignificantNode.nodeName === 'BR') {
                            // 只有当这个BR当前可见时，才隐藏它作为“连续”的一部分
                            if (nextSignificantNode.style.display !== 'none' || !nextSignificantNode.hasAttribute(PROCESSED_BY_PLUGIN_ATTR)) {
                                markBrAsHidden(nextSignificantNode, 'chatMergeConsecutiveBr');
                            }
                            nextSignificantNode = nextSignificantNode.nextSibling;
                        } else {
                            break;
                        }
                    }
                }
            }

            if (settings.chatSmartExternalBr) {
                const significantWrappers = ['P', 'DIV', 'LI', 'BLOCKQUOTE', 'PRE', 'TD', 'TH', 'SECTION', 'ARTICLE', 'ASIDE', 'MAIN', 'HEADER', 'FOOTER', 'NAV', 'SPAN'];
                brNodesInContainer.forEach(br => {
                    if (!br) return;

                    let parent = br.parentElement;
                    let isWrapped = false;
                    while (parent && parent !== chatContainer) {
                        if (significantWrappers.includes(parent.nodeName.toUpperCase())) {
                            isWrapped = true;
                            break;
                        }
                        parent = parent.parentElement;
                    }

                    if (isWrapped) {
                        if (br.style.display === 'none' && br.hasAttribute(PROCESSED_BY_PLUGIN_ATTR)) {
                            const hiddenByRule = br.getAttribute(HIDDEN_BY_RULE_ATTR);
                            // 如果是被 Leading 或 Merge 规则隐藏的，Smart 规则现在豁免它
                            // 或者如果不是被本规则的“隐藏裸露”部分隐藏的
                            if (hiddenByRule === 'chatHideLeadingBr' || hiddenByRule === 'chatMergeConsecutiveBr' || hiddenByRule !== 'chatSmartExternalBr_hide_naked') {
                                markBrAsVisible(br, 'chatSmartExternalBr_exempt');
                            }
                        } else if (br.style.display !== 'none' && !br.hasAttribute(PROCESSED_BY_PLUGIN_ATTR)) {
                             markBrAsVisible(br, 'chatSmartExternalBr_kept'); // 本来就可见，标记为被保留
                        }
                    } else { // Naked BR
                        if (br.style.display !== 'none') {
                            const currentRuleAttr = br.getAttribute(HIDDEN_BY_RULE_ATTR);
                            // 只有当它没有被其他规则明确豁免或被本规则的“保留”部分保留时才隐藏
                            if (!currentRuleAttr || (!currentRuleAttr.includes('exempt') && !currentRuleAttr.includes('kept_by_chatSmartExternalBr'))) {
                                markBrAsHidden(br, 'chatSmartExternalBr_hide_naked');
                            }
                        }
                    }
                });
            }
        });
    } catch (error) {
        console.error(`[${extensionName}] 在 applyBrRules 执行期间发生错误 (源: ${source}):`, error);
    } finally {
        // console.timeEnd(`[${extensionName}] applyBrRules (${source})`);
        isApplyingRules = false;
    }
}


/**
 * 更新设置界面中的复选框状态。
 */
function updateUIFromSettings() {
    const s = currentSettings;
    $('#st-br-chat-hide-all').prop('checked', s.chatHideAllBr);
    $('#st-br-chat-hide-leading').prop('checked', s.chatHideLeadingBr);
    $('#st-br-chat-merge-consecutive').prop('checked', s.chatMergeConsecutiveBr);
    $('#st-br-chat-smart-external').prop('checked', s.chatSmartExternalBr);
    $('#st-br-global-hide-all').prop('checked', s.globalHideAllBr);
}

/**
 * 当设置界面中的复选框状态改变时调用。
 * @param {Event} event - DOM事件对象。
 */
function onSettingsChange(event) {
    const targetId = event.target.id;
    const checked = Boolean(event.target.checked);

    switch (targetId) {
        case 'st-br-chat-hide-all': currentSettings.chatHideAllBr = checked; break;
        case 'st-br-chat-hide-leading': currentSettings.chatHideLeadingBr = checked; break;
        case 'st-br-chat-merge-consecutive': currentSettings.chatMergeConsecutiveBr = checked; break;
        case 'st-br-chat-smart-external':
            currentSettings.chatSmartExternalBr = checked;
            if (checked && typeof toastr !== 'undefined') {
                toastr.info("“智能保留/隐藏”规则是实验性的。", "实验性功能提示", { timeOut: 5000 });
            }
            break;
        case 'st-br-global-hide-all':
            currentSettings.globalHideAllBr = checked;
            if (checked && typeof toastr !== 'undefined') {
                toastr.warning("全局隐藏 <br> 已启用。", "BR标签控制警告", { timeOut: 7000, preventDuplicates: true });
            }
            break;
        default: return;
    }

    saveSettingsToLocalStorage(currentSettings);
    // 延迟一小段时间再应用规则，确保DOM可能因设置更改而发生的任何其他更新已完成
    setTimeout(() => applyBrRules("settingsChange"), 50);
}

// --- MutationObserver ---
let chatObserver = null;
/**
 * 初始化并启动MutationObserver来监听聊天区域的DOM变化。
 */
function observeChatMessages() {
    // 增加防抖延迟，并确保在DOM稳定后再执行
    const debouncedApplyBrRules = debounce(() => {
        // 在实际执行前再延迟一小会儿，给DOM充分的渲染时间
        setTimeout(() => applyBrRules("mutationObserver"), 100);
    }, 350); // 防抖延迟增加到350ms

    const chatAreaSelectors = ['#chat', '.chat-messages-container', '#chat-scroll-container', 'div[class*="chatlog"]', '.message_chat', 'body'];
    let mainChatArea = null;
    for (const selector of chatAreaSelectors) {
        mainChatArea = document.querySelector(selector);
        if (mainChatArea) break;
    }

    if (!mainChatArea) {
        console.warn(`[${extensionName}] 未能找到合适的聊天区域进行监听。`);
        mainChatArea = document.body; // 回退
    }

    if (chatObserver) chatObserver.disconnect();

    chatObserver = new MutationObserver((mutationsList) => {
        let relevantMutation = false;
        for (const mutation of mutationsList) {
            if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
                for (const node of mutation.addedNodes) {
                    if (node.nodeType === Node.ELEMENT_NODE) {
                        // 更广泛地匹配消息节点，.mes是SillyTavern核心的，其他是备用
                        if (node.matches && (node.matches('.mes') || node.querySelector('.mes_text') || node.classList.contains('message') || node.classList.contains('ChatMessageEntity'))) {
                            relevantMutation = true;
                            break;
                        }
                        // 有时AI回复可能直接作为文本节点或包裹在简单的div里添加到聊天容器，检查父级是否是聊天区域
                        if(mainChatArea.contains(node) && node.parentElement === mainChatArea && node.nodeName !== 'SCRIPT' && node.nodeName !== 'STYLE'){
                            // console.log(`[${extensionName}] Direct child added to mainChatArea:`, node.nodeName);
                            relevantMutation = true; // 如果是直接子节点添加，也认为相关
                            break;
                        }
                    }
                }
            }
            // 也考虑 characterData 变化，例如通过JS编辑了现有消息的文本内容
            if (mutation.type === 'characterData' && mutation.target.parentElement && mainChatArea.contains(mutation.target.parentElement)) {
                 // console.log(`[${extensionName}] Character data changed within chat area.`);
                 relevantMutation = true;
            }
            if (relevantMutation) break;
        }

        if (relevantMutation) {
            debouncedApplyBrRules();
        }
    });

    chatObserver.observe(mainChatArea, { childList: true, subtree: true, characterData: true }); // 添加characterData监听
    // console.log(`[${extensionName}] MutationObserver已启动，监听目标:`, mainChatArea);
}

/**
 * 防抖函数。
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

// --- SillyTavern 事件监听 ---
let eventSourceInstance, eventTypesInstance;
try {
    import('../../../../script.js')
        .then(module => {
            eventSourceInstance = module.eventSource;
            eventTypesInstance = module.event_types;
            const { getContext } = module; // 尝试获取 getContext

            if (eventSourceInstance && eventTypesInstance) {
                // 增加延迟和防抖，确保DOM渲染完成
                const debouncedApplyBrRulesOnEvent = debounce(() => {
                    setTimeout(() => applyBrRules("sillytavernEvent"), 150); // 事件触发后也延迟
                }, 450);

                eventSourceInstance.on(eventTypesInstance.CHAT_UPDATED, debouncedApplyBrRulesOnEvent);
                eventSourceInstance.on(eventTypesInstance.MESSAGE_SWIPED, debouncedApplyBrRulesOnEvent);
                eventSourceInstance.on(eventTypesInstance.USER_MESSAGE_SENT, () => setTimeout(() => applyBrRules("userMessageSent"), 200)); // 用户发送后稍等片刻
                eventSourceInstance.on(eventTypesInstance.CHARACTER_MESSAGE_RECEIVED, () => setTimeout(() => applyBrRules("characterMessageReceived"), 200)); // AI回复后稍等片刻
                eventSourceInstance.on(eventTypesInstance.CHAT_CHANGED, () => { // 切换角色或聊天时
                     console.log(`[${extensionName}] CHAT_CHANGED event detected.`);
                     setTimeout(() => {
                        // 重新加载设置可能不是必要的，但确保UI和规则基于当前聊天是好的
                        currentSettings = loadSettingsFromLocalStorage();
                        updateUIFromSettings();
                        applyBrRules("chatChanged");
                        // 切换聊天后，MutationObserver可能需要重新绑定到新的聊天容器（如果DOM结构变化大）
                        // 但SillyTavern通常是更新内容而不是替换整个聊天DOM根节点
                        // observeChatMessages(); // 如果需要，可以取消注释，但这可能过于频繁
                     }, 500); // 给聊天切换足够的时间完成DOM更新
                });

                // 监听角色加载事件，以处理开场白
                // SillyTavern的 `キャラクターがロードされました` (character_loaded) 事件可能不是标准API的一部分，
                // 但 `CONTEXT_UPDATED` 或 `CHAT_CHANGED` 通常在角色加载后发生。
                // 我们已经在监听 CHAT_CHANGED。
                // 另一种可能是DOM加载完成后，如果开场白是静态的，初始的applyBrRules应该能处理。

                // console.log(`[${extensionName}] 已附加到SillyTavern的事件监听器。`);
            }
        })
        .catch(err => {
            // console.warn(`[${extensionName}] 从SillyTavern的script.js动态导入eventSource/event_types失败:`, err.message);
        });
} catch (e) {
    // console.warn(`[${extensionName}] 尝试动态导入SillyTavern事件系统时发生错误:`, e.message);
}


// --- jQuery $(document).ready() ---
jQuery(async () => {
    try {
        const settingsHtmlPath = `${extensionFolderPath}/settings.html`;
        const settingsHtml = await $.get(settingsHtmlPath);

        const $extensionsSettingsContainer = $("#extensions_settings");
        if ($extensionsSettingsContainer.length) {
            $extensionsSettingsContainer.append(settingsHtml);
        } else {
            console.warn(`[${extensionName}] 未找到 #extensions_settings 容器。`);
        }

        // 使用更精确的ID选择器进行事件委托，确保 settings.html 的根div有此ID
        $(document).on('input', '#remove-br-tags-extension-settings-container input[type="checkbox"]', onSettingsChange);
        $(document).on('click', '#remove-br-tags-extension-settings-container #st-br-apply-rules-now', () => {
            if (typeof toastr !== 'undefined') {
                toastr.info("正在手动应用BR处理规则...", extensionName, { timeOut: 1000 });
            }
            applyBrRules("manualApplyButton");
        });

        currentSettings = loadSettingsFromLocalStorage();
        updateUIFromSettings();

        // 首次加载时，延迟应用规则，给页面其他部分（包括开场白）加载的时间
        setTimeout(() => {
            // console.log(`[${extensionName}] 首次加载，延迟后应用规则...`);
            applyBrRules("initialLoad");
        }, 750); // 延迟时间可以根据需要调整

        observeChatMessages();

        console.log(`[${extensionName}] 插件初始化成功。`);

    } catch (error) {
        console.error(`[${extensionName}] 插件初始化过程中发生严重错误:`, error);
        if (typeof toastr !== 'undefined') {
            toastr.error(`插件 "${extensionName}" 初始化失败。详情请查看浏览器控制台。`, "插件错误", { timeOut: 0 });
        }
        alert(`插件 "${extensionName}" 初始化时发生严重错误。请按F12查看控制台。`);
    }
});
