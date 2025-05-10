// remove-br-tags-extension/index.js

// --- 常量和全局变量 ---
const extensionName = "remove-br-tags-extension";
const extensionFolderPath = `scripts/extensions/third-party/${extensionName}`;
const LOCAL_STORAGE_KEY = `st-ext-${extensionName}-settings-v5`; // 版本号再次升级

const defaultSettings = {
    chatHideAllBr: false,       // 主要由此规则控制CSS注入
    chatHideLeadingBr: true,
    chatMergeConsecutiveBr: true,
    chatSmartExternalBr: false, // JS DOM操作
    globalHideAllBr: false,     // CSS注入
};

// 插件动态添加的<style>标签的ID
const DYNAMIC_STYLE_TAG_ID = `${extensionName}-dynamic-styles`;

// 用于JS DOM操作的属性
const ORIGINAL_DISPLAY_ATTR = 'data-original-display'; // 不再主要使用，因为CSS优先
const PROCESSED_BY_JS_ATTR = 'data-br-js-processed'; // 标记被JS复杂逻辑处理过
const JS_HIDDEN_BY_RULE_ATTR = 'data-br-js-hidden-by';

let currentSettings = loadSettingsFromLocalStorage();
let isApplyingJsRules = false; // JS规则应用的重入保护
let applyJsRulesTimeoutId = null;

// --- 设置加载与保存 (不变) ---
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

// --- 核心逻辑 ---

/**
 * 根据当前设置更新动态<style>标签中的CSS规则。
 * 主要处理全局性的隐藏规则。
 */
function updateDynamicCssRules() {
    const settings = currentSettings;
    let cssRules = "";

    const chatMessageSelectorsArr = [ // 保持与JS中一致的选择器
        '.mes_text', '.mes .force-user-msg .mes_text', '.mes .force-char-msg .mes_text',
        'div[id^="chatMessage"] .mes_text', '.message-content', '.chitchat-text',
        '.custom-message-class'
    ];
    const chatSelectors = chatMessageSelectorsArr.join(', ');

    if (settings.globalHideAllBr) {
        cssRules += `body br { display: none !important; }\n`;
    } else {
        // 如果全局不隐藏，但聊天内隐藏
        if (settings.chatHideAllBr) {
            cssRules += `${chatSelectors} br { display: none !important; }\n`;
        } else {
            // 如果chatHideAllBr也是false，那么之前由它注入的CSS需要被清除
            // 这里通过不添加规则来实现。如果style标签中只有这一条，它会被清空。
        }
    }

    let styleTag = document.getElementById(DYNAMIC_STYLE_TAG_ID);
    if (!styleTag) {
        styleTag = document.createElement('style');
        styleTag.id = DYNAMIC_STYLE_TAG_ID;
        styleTag.type = 'text/css';
        document.head.appendChild(styleTag);
    }

    if (styleTag.textContent !== cssRules) {
        styleTag.textContent = cssRules;
        // console.log(`[${extensionName}] 动态CSS规则已更新:`, cssRules.trim() === "" ? "无规则 (清除)" : cssRules);
    }
}

/**
 * 清除指定容器内由JS DOM操作添加的属性和内联样式。
 * 在重新应用JS规则前调用。
 * @param {HTMLElement} container
 */
function revertJsBrModificationsInContainer(container) {
    container.querySelectorAll(`br[${PROCESSED_BY_JS_ATTR}]`).forEach(br => {
        // 移除内联style（如果是由JS添加的）
        // 我们不再存储originalDisplay，因为CSS优先，JS只在CSS不隐藏时操作
        // 如果JS隐藏了它，直接移除内联style就会让CSS规则或默认display生效
        br.style.display = ''; // 清除JS设置的内联display
        br.removeAttribute(PROCESSED_BY_JS_ATTR);
        br.removeAttribute(JS_HIDDEN_BY_RULE_ATTR);
    });
}

/**
 * 应用需要JavaScript DOM操作的复杂规则。
 * (如合并连续、隐藏开头、智能判断)
 * 这个函数只在 chatHideAllBr 和 globalHideAllBr 都为 false 时才应该有实际效果。
 * @param {string} source
 * @param {HTMLElement|null} specificMessageContainer
 */
function applyJsComplexBrRules(source = "unknown_js_rules", specificMessageContainer = null) {
    if (isApplyingJsRules) {
        // console.log(`[${extensionName}] applyJsComplexBrRules 跳过 (源: ${source}, isApplyingJsRules: true)`);
        return;
    }
    isApplyingJsRules = true;
    // console.time(`[${extensionName}] applyJsComplexBrRules (${source})`);

    const settings = currentSettings;

    // 如果CSS规则已经隐藏了所有相关的BR，则JS无需再做处理
    if (settings.globalHideAllBr || settings.chatHideAllBr) {
        isApplyingJsRules = false;
        // console.timeEnd(`[${extensionName}] applyJsComplexBrRules (${source}) - CSS已隐藏，JS跳过`);
        return;
    }

    try {
        const chatMessageSelectorsArr = [ /* ...同上... */
            '.mes_text', '.mes .force-user-msg .mes_text', '.mes .force-char-msg .mes_text',
            'div[id^="chatMessage"] .mes_text', '.message-content', '.chitchat-text',
            '.custom-message-class'
        ];
        
        const containersToProcess = specificMessageContainer ?
            (specificMessageContainer.matches(chatMessageSelectorsArr.join(',')) ? [specificMessageContainer] : []) :
            document.querySelectorAll(chatMessageSelectorsArr.join(', '));

        containersToProcess.forEach(chatContainer => {
            if (!chatContainer || typeof chatContainer.querySelectorAll !== 'function') return;

            // 在处理此容器前，清除之前JS操作的痕迹
            revertJsBrModificationsInContainer(chatContainer);

            // 获取当前实际可见的<br>列表（即未被CSS规则隐藏的）
            // 这一步很关键，我们只对CSS规则处理后仍然可见的<br>应用JS逻辑
            let brNodesInContainer = Array.from(chatContainer.querySelectorAll('br'))
                                          .filter(br => window.getComputedStyle(br).display !== 'none');

            // 规则：隐藏开头BR (JS版)
            if (settings.chatHideLeadingBr) {
                let firstNode = chatContainer.firstChild;
                while (firstNode && firstNode.nodeType === Node.TEXT_NODE && firstNode.textContent.trim() === '') {
                    firstNode = firstNode.nextSibling;
                }
                if (firstNode && firstNode.nodeName === 'BR' && window.getComputedStyle(firstNode).display !== 'none') {
                    firstNode.style.display = 'none'; // JS直接隐藏
                    firstNode.setAttribute(PROCESSED_BY_JS_ATTR, 'true');
                    firstNode.setAttribute(JS_HIDDEN_BY_RULE_ATTR, 'chatHideLeadingBr_js');
                }
                // 更新可见BR列表
                brNodesInContainer = brNodesInContainer.filter(br => br !== firstNode || window.getComputedStyle(br).display !== 'none');
            }

            // 规则：合并连续BR (JS版)
            if (settings.chatMergeConsecutiveBr) {
                for (let i = 0; i < brNodesInContainer.length; i++) {
                    const currentBr = brNodesInContainer[i];
                    if (!currentBr || window.getComputedStyle(currentBr).display === 'none') { // 必须是当前可见的
                        continue;
                    }

                    let nextSignificantNode = currentBr.nextSibling;
                    while (nextSignificantNode) {
                        if (nextSignificantNode.nodeType === Node.TEXT_NODE && nextSignificantNode.textContent.trim() === '') {
                            nextSignificantNode = nextSignificantNode.nextSibling;
                            continue;
                        }
                        if (nextSignificantNode.nodeName === 'BR' && window.getComputedStyle(nextSignificantNode).display !== 'none') {
                            nextSignificantNode.style.display = 'none'; // JS直接隐藏
                            nextSignificantNode.setAttribute(PROCESSED_BY_JS_ATTR, 'true');
                            nextSignificantNode.setAttribute(JS_HIDDEN_BY_RULE_ATTR, 'chatMergeConsecutiveBr_js');
                            nextSignificantNode = nextSignificantNode.nextSibling;
                        } else {
                            break;
                        }
                    }
                }
                // 更新可见BR列表
                brNodesInContainer = brNodesInContainer.filter(br => window.getComputedStyle(br).display !== 'none');
            }

            // 规则：智能保留/隐藏 (JS版)
            if (settings.chatSmartExternalBr) {
                const significantWrappers = ['P', 'DIV', 'LI', 'BLOCKQUOTE', 'PRE', 'TD', 'TH', 'SPAN'];
                brNodesInContainer.forEach(br => { // 只处理当前仍然可见的BR
                    if (!br || window.getComputedStyle(br).display === 'none') return;

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
                        // 被包裹，且当前可见，则标记为JS保留（实际上啥也不做，让它保持CSS或默认的可见）
                        br.setAttribute(PROCESSED_BY_JS_ATTR, 'true');
                        br.setAttribute(JS_HIDDEN_BY_RULE_ATTR, 'chatSmartExternalBr_js_kept_wrapped');
                    } else { // 裸露的BR，且当前可见
                        br.style.display = 'none'; // JS隐藏
                        br.setAttribute(PROCESSED_BY_JS_ATTR, 'true');
                        br.setAttribute(JS_HIDDEN_BY_RULE_ATTR, 'chatSmartExternalBr_js_hide_naked');
                    }
                });
            }
        });
    } catch (error) {
        console.error(`[${extensionName}] 在 applyJsComplexBrRules 执行期间发生错误 (源: ${source}):`, error);
    } finally {
        isApplyingJsRules = false;
        // console.timeEnd(`[${extensionName}] applyJsComplexBrRules (${source})`);
    }
}


// --- UI 更新与事件处理 ---
function updateUIFromSettings() {
    // ... (与之前版本相同) ...
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

    // 首先更新CSS规则，这是即时生效的
    updateDynamicCssRules();
    // 然后，如果需要，应用复杂的JS规则 (CSS规则优先)
    // 给一个非常短的延迟，确保CSS先生效
    setTimeout(() => requestAnimationFrame(() => applyJsComplexBrRules("settingsChange_js_rules")), 50);
}

// --- DOM 变化监听 (MutationObserver) ---
let chatObserver = null;
const ST_EDIT_TEXTAREA_SELECTOR = '.mes_textarea, textarea.auto-size';

function observeChatMessages() {
    const debouncedApplyJsRules = debounce(() => {
        requestAnimationFrame(() => applyJsComplexBrRules("mutationObserver_debounced_js_rules"));
    }, 380); // JS规则的防抖可以稍长一些

    const chatAreaSelectors = ['#chat', '.chat-messages-container', '#chat-scroll-container', '.message_chat', 'body'];
    let mainChatArea = null;
    for (const selector of chatAreaSelectors) {
        mainChatArea = document.querySelector(selector);
        if (mainChatArea) break;
    }
    if (!mainChatArea) mainChatArea = document.body;

    if (chatObserver) chatObserver.disconnect();

    chatObserver = new MutationObserver((mutationsList) => {
        let needsJsRulesReapply = false; // 标记是否需要重新应用JS规则
        let editedMessageContainer = null; // 标记当前是否在处理编辑相关的DOM变化

        for (const mutation of mutationsList) {
            if (mutation.type === 'childList') {
                // 处理进入编辑模式 (textarea 添加)
                for (const node of mutation.addedNodes) {
                    if (node.nodeType === Node.ELEMENT_NODE && node.matches && node.matches(ST_EDIT_TEXTAREA_SELECTOR)) {
                        editedMessageContainer = node.closest(chatMessageSelectors.join(', '));
                        if (editedMessageContainer) {
                            // console.log(`[${extensionName}] 进入编辑模式，恢复容器内BR:`, editedMessageContainer);
                            // 强制清除此容器的JS修改，让CSS或原始HTML生效
                            revertJsBrModificationsInContainer(editedMessageContainer);
                            // 编辑时CSS规则依然生效，所以如果chatHideAllBr=true，BR还是会被CSS隐藏
                        }
                        break; // 找到编辑框，不再看其他addedNodes
                    }
                }
                if (editedMessageContainer) break; // 如果是进入编辑，跳出外层循环，本次不触发全局JS规则

                // 处理退出编辑模式 (textarea 移除)
                for (const node of mutation.removedNodes) {
                    if (node.nodeType === Node.ELEMENT_NODE && node.matches && node.matches(ST_EDIT_TEXTAREA_SELECTOR)) {
                        // mutation.target 是 textarea 的前父节点
                        const parentOfTextarea = mutation.target;
                        editedMessageContainer = parentOfTextarea.closest(chatMessageSelectors.join(', '));
                        if (editedMessageContainer) {
                            // console.log(`[${extensionName}] 退出编辑模式，处理容器:`, editedMessageContainer);
                            // 针对这个特定容器延迟应用JS规则
                            clearTimeout(applyJsRulesTimeoutId);
                            applyJsRulesTimeoutId = setTimeout(() => requestAnimationFrame(() => applyJsComplexBrRules("edit_mode_exit_js_rules", editedMessageContainer)), 150);
                        } else {
                            needsJsRulesReapply = true; // 找不到特定容器，则全局刷新JS规则
                        }
                        break; // 找到移除的编辑框
                    }
                }
                if (editedMessageContainer) break; // 如果是退出编辑，跳出外层循环

                // 处理新消息添加 (非编辑模式时)
                if (!editedMessageContainer) {
                    for (const node of mutation.addedNodes) {
                        if (node.nodeType === Node.ELEMENT_NODE && node.matches && (node.matches('.mes') || node.querySelector('.mes_text, .message-content'))) {
                            needsJsRulesReapply = true;
                            break;
                        }
                    }
                }
            }
            if (needsJsRulesReapply || editedMessageContainer) break;
        }

        if (needsJsRulesReapply && !editedMessageContainer) {
            debouncedApplyJsRules(); // 全局应用JS规则
        }
    });
    chatObserver.observe(mainChatArea, { childList: true, subtree: true });
}

function debounce(func, wait) {
    // ... (不变) ...
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
function setupSillyTavernEventListeners() {
    try {
        import('../../../../script.js')
            .then(module => {
                eventSourceInstance = module.eventSource;
                eventTypesInstance = module.event_types;
                if (eventSourceInstance && eventTypesInstance) {
                    const applyJsRulesAfterEvent = (source, delay = 280, specificTarget = null) => {
                        clearTimeout(applyJsRulesTimeoutId);
                        applyJsRulesTimeoutId = setTimeout(() => requestAnimationFrame(() => applyJsComplexBrRules(source, specificTarget)), delay);
                    };
                    // CSS规则由 updateDynamicCssRules() 在设置更改时直接处理
                    //这里的事件主要触发JS复杂规则的重新应用
                    eventSourceInstance.on(eventTypesInstance.CHAT_UPDATED, () => applyJsRulesAfterEvent("CHAT_UPDATED_js_rules", 380));
                    eventSourceInstance.on(eventTypesInstance.MESSAGE_SWIPED, () => applyJsRulesAfterEvent("MESSAGE_SWIPED_js_rules", 300));
                    eventSourceInstance.on(eventTypesInstance.USER_MESSAGE_SENT, () => applyJsRulesAfterEvent("USER_MESSAGE_SENT_js_rules", 280));
                    eventSourceInstance.on(eventTypesInstance.CHARACTER_MESSAGE_RECEIVED, () => applyJsRulesAfterEvent("CHARACTER_MESSAGE_RECEIVED_js_rules", 280));
                    eventSourceInstance.on(eventTypesInstance.CHAT_CHANGED, () => {
                        clearTimeout(applyJsRulesTimeoutId);
                        applyJsRulesTimeoutId = setTimeout(() => {
                            requestAnimationFrame(() => {
                                currentSettings = loadSettingsFromLocalStorage();
                                updateUIFromSettings();
                                updateDynamicCssRules(); // 切换聊天时，确保CSS规则也基于最新设置
                                applyJsComplexBrRules("CHAT_CHANGED_completed_js_rules");
                            });
                        }, 750);
                    });
                }
            })
            .catch(err => { /* console.warn(...) */ });
    } catch (e) { /* console.warn(...) */ }
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
            if (typeof toastr !== 'undefined') toastr.info("手动应用所有规则...", extensionName, { timeOut: 1000 });
            updateDynamicCssRules();
            requestAnimationFrame(() => applyJsComplexBrRules("manualApplyButton_js_rules"));
        });

        currentSettings = loadSettingsFromLocalStorage();
        updateUIFromSettings();
        updateDynamicCssRules(); // 首次加载时应用CSS规则

        requestAnimationFrame(() => {
            setTimeout(() => {
                applyJsComplexBrRules("initialLoad_delayed_js_rules"); // 首次加载时应用JS规则
            }, 900); // 进一步增加初始延迟
        });

        observeChatMessages();
        setupSillyTavernEventListeners();

        console.log(`[${extensionName}] 插件初始化成功 (v5). CSS引擎和JS引擎已加载。`);

    } catch (error) {
        console.error(`[${extensionName}] 初始化严重错误:`, error);
        if (typeof toastr !== 'undefined') toastr.error(`插件 "${extensionName}" 初始化失败。查看控制台。`, "插件错误", { timeOut: 0 });
        alert(`插件 "${extensionName}" 初始化错误。F12查看控制台。`);
    }
});
