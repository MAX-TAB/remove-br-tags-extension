// remove-br-tags-extension/index.js

// --- 常量和全局变量 ---
const extensionName = "remove-br-tags-extension";
const extensionFolderPath = `scripts/extensions/third-party/${extensionName}`;
const LOCAL_STORAGE_KEY = `st-ext-${extensionName}-settings-v3`; // 升级版本号以确保设置重置

const defaultSettings = {
    chatHideAllBr: false,
    chatHideLeadingBr: true,
    chatMergeConsecutiveBr: true,
    chatSmartExternalBr: false,
    globalHideAllBr: false,
};

const ORIGINAL_DISPLAY_ATTR = 'data-original-display';
const PROCESSED_BY_PLUGIN_ATTR = 'data-br-processed';
const HIDDEN_BY_RULE_ATTR = 'data-br-hidden-by';

let currentSettings = loadSettingsFromLocalStorage();
let isApplyingRules = false; // 防止applyBrRules重入
let applyRulesTimeoutId = null; // 用于管理延迟执行的timeoutID

// --- 设置加载与保存 ---
function loadSettingsFromLocalStorage() {
    try {
        const storedSettings = localStorage.getItem(LOCAL_STORAGE_KEY);
        if (storedSettings) {
            const parsedSettings = JSON.parse(storedSettings);
            return { ...defaultSettings, ...parsedSettings };
        }
    } catch (error) { console.error(`[${extensionName}] 加载设置错误:`, error); }
    return { ...defaultSettings };
}

function saveSettingsToLocalStorage(settings) {
    try {
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(settings));
    } catch (error) { console.error(`[${extensionName}] 保存设置错误:`, error); }
}

// --- DOM 操作核心 ---
function revertAllBrModifications() {
    document.querySelectorAll(`br[${PROCESSED_BY_PLUGIN_ATTR}]`).forEach(br => {
        const originalDisplay = br.getAttribute(ORIGINAL_DISPLAY_ATTR);
        br.style.display = originalDisplay || '';
        br.removeAttribute(ORIGINAL_DISPLAY_ATTR);
        br.removeAttribute(PROCESSED_BY_PLUGIN_ATTR);
        br.removeAttribute(HIDDEN_BY_RULE_ATTR);
    });
}

function markBrAsHidden(brElement, ruleName) {
    if (!brElement || typeof brElement.hasAttribute !== 'function') return;
    const currentDisplay = window.getComputedStyle(brElement).display;

    if (!brElement.hasAttribute(PROCESSED_BY_PLUGIN_ATTR) || currentDisplay !== 'none') {
        if (currentDisplay !== 'none' && !brElement.hasAttribute(ORIGINAL_DISPLAY_ATTR)) {
            brElement.setAttribute(ORIGINAL_DISPLAY_ATTR, currentDisplay);
        }
        brElement.style.display = 'none';
        brElement.setAttribute(PROCESSED_BY_PLUGIN_ATTR, 'true');
        brElement.setAttribute(HIDDEN_BY_RULE_ATTR, ruleName);
    } else if (brElement.style.display !== 'none' && brElement.hasAttribute(PROCESSED_BY_PLUGIN_ATTR)) {
        // 已被处理过，但当前可见（可能被其他脚本修改），再次强制隐藏
        brElement.style.display = 'none';
        brElement.setAttribute(HIDDEN_BY_RULE_ATTR, ruleName); // 更新规则标记
    }
}

function markBrAsVisible(brElement, ruleName) {
    if (!brElement || typeof brElement.hasAttribute !== 'function') return;
    if (brElement.hasAttribute(PROCESSED_BY_PLUGIN_ATTR) && brElement.style.display === 'none') {
        const originalDisplay = brElement.getAttribute(ORIGINAL_DISPLAY_ATTR);
        brElement.style.display = originalDisplay || ''; // 恢复原始或默认
        brElement.setAttribute(HIDDEN_BY_RULE_ATTR, `exempted_by_${ruleName}`);
    } else if (!brElement.hasAttribute(PROCESSED_BY_PLUGIN_ATTR)) {
        // 如果本来就可见且未被处理，标记为被此规则"保留"（即未隐藏）
        brElement.setAttribute(PROCESSED_BY_PLUGIN_ATTR, 'true');
        brElement.setAttribute(HIDDEN_BY_RULE_ATTR, `kept_by_${ruleName}`);
    }
}

/**
 * 规则应用函数，增加了调用源追踪和简单的重入保护
 * @param {string} source - 调用此函数的来源，用于调试
 * @param {HTMLElement|null} specificContainer - 可选，如果只想处理特定的聊天消息容器
 */
function applyBrRules(source = "unknown", specificContainer = null) {
    if (isApplyingRules && source !== "direct_call_after_revert") { // direct_call_after_revert 是特殊情况
        // console.log(`[${extensionName}] applyBrRules 调用被跳过 (源: ${source}, isApplyingRules: true)`);
        return;
    }
    isApplyingRules = true;
    // console.time(`[${extensionName}] applyBrRules (${source})`);

    // 如果不是针对特定容器，则先全局恢复
    if (!specificContainer) {
        revertAllBrModifications();
    } else {
        // 如果是特定容器，只恢复该容器内的
        specificContainer.querySelectorAll(`br[${PROCESSED_BY_PLUGIN_ATTR}]`).forEach(br => {
            const originalDisplay = br.getAttribute(ORIGINAL_DISPLAY_ATTR);
            br.style.display = originalDisplay || '';
            br.removeAttribute(ORIGINAL_DISPLAY_ATTR);
            br.removeAttribute(PROCESSED_BY_PLUGIN_ATTR);
            br.removeAttribute(HIDDEN_BY_RULE_ATTR);
        });
    }

    const settings = currentSettings;

    try {
        if (settings.globalHideAllBr && !specificContainer) { // 全局隐藏只在非特定容器调用时生效
            document.querySelectorAll('body br').forEach(br => markBrAsHidden(br, 'globalHideAllBr'));
            isApplyingRules = false;
            // console.timeEnd(`[${extensionName}] applyBrRules (${source})`);
            return;
        }

        const chatMessageSelectors = [
            '.mes_text', '.mes .force-user-msg .mes_text', '.mes .force-char-msg .mes_text',
            'div[id^="chatMessage"] .mes_text', '.message-content', '.chitchat-text',
            '.custom-message-class' // 示例：添加一个自定义的聊天消息类
        ];

        const containersToProcess = specificContainer ? [specificContainer] : document.querySelectorAll(chatMessageSelectors.join(', '));

        containersToProcess.forEach(chatContainer => {
            if (!chatContainer || typeof chatContainer.querySelectorAll !== 'function') return;

            if (settings.chatHideAllBr) {
                chatContainer.querySelectorAll('br').forEach(br => markBrAsHidden(br, 'chatHideAllBr'));
                return; // 此容器处理完毕
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
                    // 必须是可见的BR才能作为合并序列的“保留者”
                    if (!currentBr || currentBr.style.display === 'none') {
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
                            if (nextSignificantNode.style.display !== 'none') {
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
                // 重新获取一遍BR节点，因为前面的规则可能已经修改了它们的style.display
                const currentVisibleBrNodes = Array.from(chatContainer.querySelectorAll('br')).filter(br => br.style.display !== 'none' || !br.hasAttribute(PROCESSED_BY_PLUGIN_ATTR));
                const currentlyHiddenBrNodesByPlugin = Array.from(chatContainer.querySelectorAll(`br[${PROCESSED_BY_PLUGIN_ATTR}][style*="display: none"]`));


                // 步骤1: 处理当前可见的BR，判断是否是裸露的并隐藏它们
                currentVisibleBrNodes.forEach(br => {
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
                        markBrAsVisible(br, 'chatSmartExternalBr_kept'); // 被包裹，保持可见
                    } else {
                        // 是裸露的，并且当前可见，则隐藏它
                        markBrAsHidden(br, 'chatSmartExternalBr_hide_naked');
                    }
                });

                // 步骤2: 处理已被其他规则隐藏的BR，判断是否是包裹的并豁免它们
                currentlyHiddenBrNodesByPlugin.forEach(br => {
                    if (!br) return;
                    const hiddenByRule = br.getAttribute(HIDDEN_BY_RULE_ATTR);
                    // 如果不是被本规则的 hide_naked 部分隐藏的 (避免自己豁免自己隐藏的)
                    if (hiddenByRule !== 'chatSmartExternalBr_hide_naked') {
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
                             // 被包裹，并且被Leading或Merge隐藏，现在豁免它
                            if (hiddenByRule === 'chatHideLeadingBr' || hiddenByRule === 'chatMergeConsecutiveBr') {
                                markBrAsVisible(br, 'chatSmartExternalBr_exempt');
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

// --- UI 更新与事件处理 ---
function updateUIFromSettings() {
    const s = currentSettings;
    $('#st-br-chat-hide-all').prop('checked', s.chatHideAllBr);
    $('#st-br-chat-hide-leading').prop('checked', s.chatHideLeadingBr);
    $('#st-br-chat-merge-consecutive').prop('checked', s.chatMergeConsecutiveBr);
    $('#st-br-chat-smart-external').prop('checked', s.chatSmartExternalBr);
    $('#st-br-global-hide-all').prop('checked', s.globalHideAllBr);
}

function onSettingsChange(event) {
    const targetId = event.target.id;
    const checked = Boolean(event.target.checked);
    switch (targetId) {
        case 'st-br-chat-hide-all': currentSettings.chatHideAllBr = checked; break;
        case 'st-br-chat-hide-leading': currentSettings.chatHideLeadingBr = checked; break;
        case 'st-br-chat-merge-consecutive': currentSettings.chatMergeConsecutiveBr = checked; break;
        case 'st-br-chat-smart-external': currentSettings.chatSmartExternalBr = checked; break;
        case 'st-br-global-hide-all': currentSettings.globalHideAllBr = checked; break;
        default: return;
    }
    saveSettingsToLocalStorage(currentSettings);
    // 使用 requestAnimationFrame 来确保在下一次浏览器绘制前应用规则，可能更平滑
    requestAnimationFrame(() => applyBrRules("settingsChange"));
}

// --- DOM 变化监听 ---
let chatObserver = null;
function observeChatMessages() {
    const debouncedAndDelayedApply = debounce(() => {
        requestAnimationFrame(() => applyBrRules("mutationObserver_debounced"));
    }, 400); // 增加防抖延迟

    const chatAreaSelectors = ['#chat', '.chat-messages-container', '#chat-scroll-container', 'div[class*="chatlog"]', '.message_chat', 'body'];
    let mainChatArea = null;
    for (const selector of chatAreaSelectors) {
        mainChatArea = document.querySelector(selector);
        if (mainChatArea) break;
    }
    if (!mainChatArea) mainChatArea = document.body;

    if (chatObserver) chatObserver.disconnect();

    chatObserver = new MutationObserver((mutationsList) => {
        let relevantMutation = false;
        for (const mutation of mutationsList) {
            if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
                for (const node of mutation.addedNodes) {
                    if (node.nodeType === Node.ELEMENT_NODE && node.matches && (node.matches('.mes') || node.querySelector('.mes_text, .message-content, .chitchat-text') || node.classList.contains('ChatMessageEntity'))) {
                        relevantMutation = true;
                        // 如果是新消息，我们可以尝试只针对这个新消息的容器应用规则
                        // applyBrRules("mutation_new_message", node.closest(chatMessageSelectors.join(','))); // 找到其父消息容器
                        break;
                    }
                }
            }
            // 如果是文本内容变化，并且目标是消息容器的一部分
            if (mutation.type === 'characterData') {
                const parentMessageContainer = mutation.target.parentElement ? mutation.target.parentElement.closest(chatMessageSelectors.join(',')) : null;
                if (parentMessageContainer) {
                    relevantMutation = true;
                    // 针对特定容器应用规则
                    // debounce(() => requestAnimationFrame(() => applyBrRules("mutation_char_data", parentMessageContainer)), 150)();
                    // break; // 暂时还是全局刷新
                }
            }
            if (relevantMutation) break;
        }
        if (relevantMutation) {
            debouncedAndDelayedApply(); // 仍然全局应用，但经过防抖和延迟
        }
    });
    chatObserver.observe(mainChatArea, { childList: true, subtree: true, characterData: true });
}

function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const context = this;
        const later = function() {
            timeout = null;
            func.apply(context, args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// --- SillyTavern 事件集成 ---
let eventSourceInstance, eventTypesInstance;
function setupSillyTavernEventListeners() {
    try {
        import('../../../../script.js')
            .then(module => {
                eventSourceInstance = module.eventSource;
                eventTypesInstance = module.event_types;
                if (eventSourceInstance && eventTypesInstance) {
                    const applyRulesAfterEvent = (source, delay = 250) => {
                        clearTimeout(applyRulesTimeoutId); // 清除之前的延迟调用
                        applyRulesTimeoutId = setTimeout(() => requestAnimationFrame(() => applyBrRules(source)), delay);
                    };

                    eventSourceInstance.on(eventTypesInstance.CHAT_UPDATED, () => applyRulesAfterEvent("CHAT_UPDATED", 300));
                    eventSourceInstance.on(eventTypesInstance.MESSAGE_SWIPED, () => applyRulesAfterEvent("MESSAGE_SWIPED", 300));
                    eventSourceInstance.on(eventTypesInstance.USER_MESSAGE_SENT, () => applyRulesAfterEvent("USER_MESSAGE_SENT", 200));
                    eventSourceInstance.on(eventTypesInstance.CHARACTER_MESSAGE_RECEIVED, () => applyRulesAfterEvent("CHARACTER_MESSAGE_RECEIVED", 200)); // AI回复
                    eventSourceInstance.on(eventTypesInstance.CHAT_CHANGED, () => {
                        // console.log(`[${extensionName}] CHAT_CHANGED event.`);
                        clearTimeout(applyRulesTimeoutId);
                        applyRulesTimeoutId = setTimeout(() => {
                            requestAnimationFrame(() => {
                                currentSettings = loadSettingsFromLocalStorage(); // 确保设置是最新的
                                updateUIFromSettings();
                                applyBrRules("CHAT_CHANGED_completed");
                            });
                        }, 600); // 给聊天切换更长的DOM稳定时间
                    });
                     // 监听编辑完成事件 (假设存在类似事件或通过CHAT_UPDATED间接触发)
                    // 如果SillyTavern没有特定的“编辑完成”事件，CHAT_UPDATED 通常会捕获到
                }
            })
            .catch(err => { /* console.warn(`[${extensionName}] ST事件系统导入失败:`, err.message); */ });
    } catch (e) { /* console.warn(`[${extensionName}] ST事件系统导入尝试错误:`, e.message); */ }
}

// --- 初始化 ---
jQuery(async () => {
    try {
        const settingsHtmlPath = `${extensionFolderPath}/settings.html`;
        const settingsHtml = await $.get(settingsHtmlPath);
        const $extensionsSettingsContainer = $("#extensions_settings");
        if ($extensionsSettingsContainer.length) {
            $extensionsSettingsContainer.append(settingsHtml);
        } else { console.warn(`[${extensionName}] #extensions_settings 未找到.`); }

        $(document).on('input', '#remove-br-tags-extension-settings-container input[type="checkbox"]', onSettingsChange);
        $(document).on('click', '#remove-br-tags-extension-settings-container #st-br-apply-rules-now', () => {
            if (typeof toastr !== 'undefined') toastr.info("手动应用规则...", extensionName, { timeOut: 1000 });
            requestAnimationFrame(() => applyBrRules("manualApplyButton"));
        });

        currentSettings = loadSettingsFromLocalStorage();
        updateUIFromSettings();

        // 首次加载时，用 RAF + setTimeout 给足DOM渲染时间
        requestAnimationFrame(() => {
            setTimeout(() => {
                applyBrRules("initialLoad_delayed");
            }, 800); // 增加初始延迟
        });

        observeChatMessages();
        setupSillyTavernEventListeners(); // 设置ST事件监听

        console.log(`[${extensionName}] 插件初始化成功 (v${defaultSettings.version || 'N/A'}). 使用存储键: ${LOCAL_STORAGE_KEY}`);

    } catch (error) {
        console.error(`[${extensionName}] 初始化严重错误:`, error);
        if (typeof toastr !== 'undefined') toastr.error(`插件 "${extensionName}" 初始化失败。查看控制台。`, "插件错误", { timeOut: 0 });
        alert(`插件 "${extensionName}" 初始化错误。F12查看控制台。`);
    }
});
