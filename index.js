// remove-br-tags-extension/index.js

// --- 常量和全局变量 ---
const extensionName = "remove-br-tags-extension";
const extensionFolderPath = `scripts/extensions/third-party/${extensionName}`;
const LOCAL_STORAGE_KEY = `st-ext-${extensionName}-settings-v4`; // 再次升级版本号，因为逻辑有较大调整

const defaultSettings = {
    chatHideAllBr: false,
    chatHideLeadingBr: true,
    chatMergeConsecutiveBr: true,
    chatSmartExternalBr: false,
    globalHideAllBr: false,
};

const ORIGINAL_DISPLAY_ATTR = 'data-original-display';
const PROCESSED_BY_PLUGIN_ATTR = 'data-br-processed'; // 标记被本插件处理过
const MODIFIED_BY_PLUGIN_STYLE_ATTR = 'data-br-style-modified'; // 标记其style.display被本插件修改过

let currentSettings = loadSettingsFromLocalStorage();
let isApplyingRules = false;
let applyRulesTimeoutId = null;

// --- 设置加载与保存 (与之前版本相同) ---
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
function revertBrModificationsInContainer(container) {
    // 只恢复指定容器内的BR标签
    container.querySelectorAll(`br[${PROCESSED_BY_PLUGIN_ATTR}]`).forEach(br => {
        if (br.hasAttribute(MODIFIED_BY_PLUGIN_STYLE_ATTR)) {
            const originalDisplay = br.getAttribute(ORIGINAL_DISPLAY_ATTR);
            br.style.display = originalDisplay || ''; // 恢复
            br.removeAttribute(ORIGINAL_DISPLAY_ATTR);
            br.removeAttribute(MODIFIED_BY_PLUGIN_STYLE_ATTR);
        }
        br.removeAttribute(PROCESSED_BY_PLUGIN_ATTR); // 移除处理标记，以便重新评估
        br.removeAttribute(HIDDEN_BY_RULE_ATTR);
    });
}

function markBrAsHidden(brElement, ruleName) {
    if (!brElement || typeof brElement.hasAttribute !== 'function') return;

    // 只要规则要求隐藏，并且它当前不是none，就隐藏它
    // 无论之前是否处理过，都要确保它是隐藏的
    if (brElement.style.display !== 'none') {
        const currentDisplay = window.getComputedStyle(brElement).display;
        if (currentDisplay !== 'none' && !brElement.hasAttribute(ORIGINAL_DISPLAY_ATTR)) {
            brElement.setAttribute(ORIGINAL_DISPLAY_ATTR, currentDisplay);
        }
        brElement.style.display = 'none';
        brElement.setAttribute(MODIFIED_BY_PLUGIN_STYLE_ATTR, 'true'); // 标记style被修改
    }
    brElement.setAttribute(PROCESSED_BY_PLUGIN_ATTR, 'true'); // 总是标记为处理过
    brElement.setAttribute(HIDDEN_BY_RULE_ATTR, ruleName);
}

function markBrAsVisible(brElement, ruleName) {
    if (!brElement || typeof brElement.hasAttribute !== 'function') return;

    // 规则要求可见（豁免/保留）
    if (brElement.style.display === 'none' && brElement.hasAttribute(MODIFIED_BY_PLUGIN_STYLE_ATTR)) {
        const originalDisplay = brElement.getAttribute(ORIGINAL_DISPLAY_ATTR);
        brElement.style.display = originalDisplay || ''; // 恢复
        // 可以选择移除MODIFIED_BY_PLUGIN_STYLE_ATTR，或者保留它并更新HIDDEN_BY_RULE_ATTR
    }
    brElement.setAttribute(PROCESSED_BY_PLUGIN_ATTR, 'true');
    brElement.setAttribute(HIDDEN_BY_RULE_ATTR, `exempted_by_${ruleName}`); // 或 kept_by_
}


function applyBrRules(source = "unknown", specificMessageContainer = null) {
    if (isApplyingRules) {
        // console.log(`[${extensionName}] applyBrRules 跳过 (源: ${source}, isApplyingRules: true)`);
        return;
    }
    isApplyingRules = true;
    // console.time(`[${extensionName}] applyBrRules (${source})`);

    const settings = currentSettings;

    try {
        // 如果是全局应用（非特定消息容器），则先恢复所有
        if (!specificMessageContainer) {
            document.querySelectorAll(`br[${PROCESSED_BY_PLUGIN_ATTR}]`).forEach(br => {
                 if (br.hasAttribute(MODIFIED_BY_PLUGIN_STYLE_ATTR)) {
                    const originalDisplay = br.getAttribute(ORIGINAL_DISPLAY_ATTR);
                    br.style.display = originalDisplay || '';
                    br.removeAttribute(ORIGINAL_DISPLAY_ATTR);
                    br.removeAttribute(MODIFIED_BY_PLUGIN_STYLE_ATTR);
                }
                br.removeAttribute(PROCESSED_BY_PLUGIN_ATTR);
                br.removeAttribute(HIDDEN_BY_RULE_ATTR);
            });
        } else {
            // 如果是针对特定消息容器，则只恢复该容器内的
            revertBrModificationsInContainer(specificMessageContainer);
        }


        if (settings.globalHideAllBr && !specificMessageContainer) {
            document.querySelectorAll('body br').forEach(br => markBrAsHidden(br, 'globalHideAllBr'));
            isApplyingRules = false;
            // console.timeEnd(`[${extensionName}] applyBrRules (${source})`);
            return;
        }

        const chatMessageSelectors = [ /* ...保持不变... */
            '.mes_text', '.mes .force-user-msg .mes_text', '.mes .force-char-msg .mes_text',
            'div[id^="chatMessage"] .mes_text', '.message-content', '.chitchat-text',
            '.custom-message-class'
        ];
        
        // 确定要处理的容器：要么是指定的，要么是所有匹配的
        const containersToProcess = specificMessageContainer ?
            (specificMessageContainer.matches(chatMessageSelectors.join(',')) ? [specificMessageContainer] : []) :
            document.querySelectorAll(chatMessageSelectors.join(', '));

        containersToProcess.forEach(chatContainer => {
            if (!chatContainer || typeof chatContainer.querySelectorAll !== 'function') {
                // console.warn(`[${extensionName}] 无效的 chatContainer 跳过:`, chatContainer);
                return;
            }

            // 获取当前容器内所有的<br>元素，这是我们操作的基础集合
            // 注意：如果SillyTavern在编辑时完全替换了消息内容（包括BR），
            // 那么这里的querySelectorAll得到的就是最新的BR列表。
            let brNodesInContainer = Array.from(chatContainer.querySelectorAll('br'));

            // 首先应用最强的隐藏规则：chatHideAllBr
            if (settings.chatHideAllBr) {
                brNodesInContainer.forEach(br => markBrAsHidden(br, 'chatHideAllBr'));
                // console.log(`[${extensionName}] 应用 chatHideAllBr 到容器`);
                return; // 如果全部隐藏，此容器的其他规则不适用
            }

            // 应用其他细分规则 (仅当 chatHideAllBr 为 false 时)

            // 规则：隐藏开头BR
            if (settings.chatHideLeadingBr) {
                let firstNode = chatContainer.firstChild;
                while (firstNode && firstNode.nodeType === Node.TEXT_NODE && firstNode.textContent.trim() === '') {
                    firstNode = firstNode.nextSibling;
                }
                if (firstNode && firstNode.nodeName === 'BR' && firstNode.style.display !== 'none') {
                    markBrAsHidden(firstNode, 'chatHideLeadingBr');
                }
            }

            // 更新brNodesInContainer列表，因为上面的规则可能已经隐藏了一些
            brNodesInContainer = Array.from(chatContainer.querySelectorAll('br'));

            // 规则：合并连续BR
            if (settings.chatMergeConsecutiveBr) {
                for (let i = 0; i < brNodesInContainer.length; i++) {
                    const currentBr = brNodesInContainer[i];
                    // currentBr必须是可见的，才能作为保留的那个
                    if (!currentBr || currentBr.style.display === 'none') {
                        continue;
                    }

                    let nextSignificantNode = currentBr.nextSibling;
                    let consecutiveCount = 0;
                    while (nextSignificantNode) {
                        if (nextSignificantNode.nodeType === Node.TEXT_NODE && nextSignificantNode.textContent.trim() === '') {
                            nextSignificantNode = nextSignificantNode.nextSibling;
                            continue;
                        }
                        if (nextSignificantNode.nodeName === 'BR') {
                            // 只有当这个BR当前可见时，才隐藏它作为“连续”的一部分
                            if (nextSignificantNode.style.display !== 'none') {
                                markBrAsHidden(nextSignificantNode, 'chatMergeConsecutiveBr');
                                consecutiveCount++;
                            }
                            nextSignificantNode = nextSignificantNode.nextSibling;
                        } else {
                            break;
                        }
                    }
                    // if (consecutiveCount > 0) console.log(`[${extensionName}] 合并了 ${consecutiveCount} 个连续BR`);
                }
            }

            // 再次更新brNodesInContainer列表
            brNodesInContainer = Array.from(chatContainer.querySelectorAll('br'));

            // 规则：智能保留/隐藏
            if (settings.chatSmartExternalBr) {
                const significantWrappers = ['P', 'DIV', 'LI', 'BLOCKQUOTE', 'PRE', 'TD', 'TH', 'SPAN']; // SPAN 有争议，但有时用于格式化
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

                    const isCurrentlyHidden = br.style.display === 'none';
                    const hiddenByRule = br.getAttribute(HIDDEN_BY_RULE_ATTR);

                    if (isWrapped) { // 被包裹
                        if (isCurrentlyHidden) {
                            // 如果是被Leading或Merge规则隐藏的，则豁免它
                            if (hiddenByRule === 'chatHideLeadingBr' || hiddenByRule === 'chatMergeConsecutiveBr') {
                                markBrAsVisible(br, 'chatSmartExternalBr_exempt_wrapped');
                            }
                            // 如果是被本规则的hide_naked部分隐藏的（理论上不应发生，因为这是isWrapped分支），也豁免
                            else if (hiddenByRule === 'chatSmartExternalBr_hide_naked') {
                                markBrAsVisible(br, 'chatSmartExternalBr_exempt_previously_naked');
                            }
                        } else {
                            // 本来就可见，标记为被保留
                            markBrAsVisible(br, 'chatSmartExternalBr_kept_wrapped');
                        }
                    } else { // 裸露的BR
                        if (!isCurrentlyHidden) {
                            // 如果当前可见，并且不是被smart规则豁免或保留的，则隐藏它
                             if (!hiddenByRule || (!hiddenByRule.includes('exempt') && !hiddenByRule.includes('kept'))) {
                                markBrAsHidden(br, 'chatSmartExternalBr_hide_naked');
                            }
                        }
                        // 如果是裸露的且已被隐藏（例如被Leading或Merge），则保持隐藏，除非有更强的豁免逻辑（目前没有）
                    }
                });
            }
        });
    } catch (error) {
        console.error(`[${extensionName}] 在 applyBrRules 执行期间发生错误 (源: ${source}):`, error);
    } finally {
        isApplyingRules = false;
        // console.timeEnd(`[${extensionName}] applyBrRules (${source})`);
    }
}


// --- UI 更新与事件处理 (与之前版本基本相同) ---
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
        // ... 其他case ...
        case 'st-br-chat-hide-leading': currentSettings.chatHideLeadingBr = checked; break;
        case 'st-br-chat-merge-consecutive': currentSettings.chatMergeConsecutiveBr = checked; break;
        case 'st-br-chat-smart-external':
            currentSettings.chatSmartExternalBr = checked;
            if (checked && typeof toastr !== 'undefined') toastr.info("“智能保留/隐藏”规则已启用 (实验性)。", "提示", { timeOut: 3000 });
            break;
        case 'st-br-global-hide-all':
            currentSettings.globalHideAllBr = checked;
            if (checked && typeof toastr !== 'undefined') toastr.warning("全局隐藏 <br> 已启用。", "警告", { timeOut: 5000 });
            break;
        default: return;
    }
    saveSettingsToLocalStorage(currentSettings);
    requestAnimationFrame(() => applyBrRules("settingsChange"));
}

// --- DOM 变化监听 ---
let chatObserver = null;
// SillyTavern中消息编辑框的典型选择器 (可能需要根据版本调整)
const ST_EDIT_TEXTAREA_SELECTOR = '.mes_textarea, textarea.auto-size'; // 或者更具体的选择器

function observeChatMessages() {
    const debouncedApplyRules = debounce(() => {
        requestAnimationFrame(() => applyBrRules("mutationObserver_debounced_global"));
    }, 350);

    const chatAreaSelectors = ['#chat', '.chat-messages-container', '#chat-scroll-container', '.message_chat', 'body'];
    let mainChatArea = null;
    for (const selector of chatAreaSelectors) {
        mainChatArea = document.querySelector(selector);
        if (mainChatArea) break;
    }
    if (!mainChatArea) mainChatArea = document.body;

    if (chatObserver) chatObserver.disconnect();

    chatObserver = new MutationObserver((mutationsList) => {
        let needsGlobalReapply = false;
        let editedMessageContainer = null;

        for (const mutation of mutationsList) {
            // 检查是否有消息进入或退出编辑模式
            if (mutation.type === 'childList') {
                for (const node of mutation.addedNodes) {
                    if (node.nodeType === Node.ELEMENT_NODE && node.matches && node.matches(ST_EDIT_TEXTAREA_SELECTOR)) {
                        // console.log(`[${extensionName}] 检测到消息进入编辑模式 (textarea 添加)`);
                        // 当textarea出现时，其父消息容器的BR可能已被ST还原，我们不需要立即做什么，等textarea消失时处理
                        editedMessageContainer = node.closest(chatMessageSelectors.join(','));
                        if(editedMessageContainer) revertBrModificationsInContainer(editedMessageContainer); // 编辑时先恢复，让用户看到原始BR
                        break;
                    }
                }
                for (const node of mutation.removedNodes) {
                     if (node.nodeType === Node.ELEMENT_NODE && node.matches && node.matches(ST_EDIT_TEXTAREA_SELECTOR)) {
                        // console.log(`[${extensionName}] 检测到消息退出编辑模式 (textarea 移除)`);
                        // 编辑框消失，说明编辑已完成或取消，此时消息内容已更新
                        editedMessageContainer = mutation.target.closest(chatMessageSelectors.join(',')); // target是textarea的父节点
                        if (editedMessageContainer) {
                            // console.log(`[${extensionName}] 针对退出编辑的消息容器应用规则:`, editedMessageContainer);
                            // 针对这个特定容器应用规则，给一点延迟让ST完成自己的渲染
                            clearTimeout(applyRulesTimeoutId);
                            applyRulesTimeoutId = setTimeout(() => requestAnimationFrame(() => applyBrRules("edit_mode_exit", editedMessageContainer)), 100);
                        } else {
                            needsGlobalReapply = true; // 如果找不到特定容器，就全局刷新
                        }
                        break;
                    }
                }
            }

            // 检查是否有新消息添加
            if (mutation.type === 'childList' && mutation.addedNodes.length > 0 && !editedMessageContainer) { // 避免编辑模式的重复触发
                for (const node of mutation.addedNodes) {
                    if (node.nodeType === Node.ELEMENT_NODE && node.matches && (node.matches('.mes') || node.querySelector('.mes_text, .message-content'))) {
                        needsGlobalReapply = true;
                        break;
                    }
                }
            }
            if (needsGlobalReapply || editedMessageContainer) break; // 如果已找到编辑相关或新消息，跳出外层循环
        }

        if (needsGlobalReapply && !editedMessageContainer) { // 只有在非编辑退出时才用debouncedApplyRules
            debouncedApplyRules();
        }
    });
    chatObserver.observe(mainChatArea, { childList: true, subtree: true }); // 暂时去掉 characterData，看是否能减少不必要的触发
}


function debounce(func, wait) {
    // ... (与之前版本相同) ...
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

// --- SillyTavern 事件集成 (与之前版本基本相同，但延迟和调用applyBrRules的source可能需要微调) ---
function setupSillyTavernEventListeners() {
    try {
        import('../../../../script.js')
            .then(module => {
                eventSourceInstance = module.eventSource;
                eventTypesInstance = module.event_types;
                if (eventSourceInstance && eventTypesInstance) {
                    const applyRulesAfterEvent = (source, delay = 250, specificTarget = null) => {
                        clearTimeout(applyRulesTimeoutId);
                        applyRulesTimeoutId = setTimeout(() => requestAnimationFrame(() => applyBrRules(source, specificTarget)), delay);
                    };
                    // CHAT_UPDATED 可能是编辑后触发的关键事件
                    eventSourceInstance.on(eventTypesInstance.CHAT_UPDATED, (data) => {
                        // data 对象可能包含被更新消息的 messageId 或 DOM element
                        // console.log("[${extensionName}] CHAT_UPDATED data:", data);
                        // let targetMessageElement = null;
                        // if (data && data.id) targetMessageElement = document.querySelector(`.mes[mesid="${data.id}"] .mes_text`);
                        // applyRulesAfterEvent("CHAT_UPDATED", 300, targetMessageElement);
                        applyRulesAfterEvent("CHAT_UPDATED", 350); // 编辑后给更长延迟
                    });
                    eventSourceInstance.on(eventTypesInstance.MESSAGE_SWIPED, () => applyRulesAfterEvent("MESSAGE_SWIPED", 300));
                    eventSourceInstance.on(eventTypesInstance.USER_MESSAGE_SENT, () => applyRulesAfterEvent("USER_MESSAGE_SENT", 250));
                    eventSourceInstance.on(eventTypesInstance.CHARACTER_MESSAGE_RECEIVED, () => applyRulesAfterEvent("CHARACTER_MESSAGE_RECEIVED", 250));
                    eventSourceInstance.on(eventTypesInstance.CHAT_CHANGED, () => {
                        clearTimeout(applyRulesTimeoutId);
                        applyRulesTimeoutId = setTimeout(() => {
                            requestAnimationFrame(() => {
                                currentSettings = loadSettingsFromLocalStorage();
                                updateUIFromSettings();
                                applyBrRules("CHAT_CHANGED_completed");
                            });
                        }, 700);
                    });
                }
            })
            .catch(err => { /* console.warn(`[${extensionName}] ST事件系统导入失败:`, err.message); */ });
    } catch (e) { /* console.warn(`[${extensionName}] ST事件系统导入尝试错误:`, e.message); */ }
}

// --- 初始化 (与之前版本基本相同) ---
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

        requestAnimationFrame(() => {
            setTimeout(() => {
                applyBrRules("initialLoad_delayed");
            }, 850); // 进一步增加初始延迟
        });

        observeChatMessages();
        setupSillyTavernEventListeners();

        console.log(`[${extensionName}] 插件初始化成功. 使用存储键: ${LOCAL_STORAGE_KEY}`);

    } catch (error) {
        console.error(`[${extensionName}] 初始化严重错误:`, error);
        if (typeof toastr !== 'undefined') toastr.error(`插件 "${extensionName}" 初始化失败。查看控制台。`, "插件错误", { timeOut: 0 });
        alert(`插件 "${extensionName}" 初始化错误。F12查看控制台。`);
    }
});
