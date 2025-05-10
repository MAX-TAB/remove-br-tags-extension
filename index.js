// remove-br-tags-extension/index.js

// --- 常量和全局变量 ---
const extensionName = "remove-br-tags-extension";
const extensionFolderPath = `scripts/extensions/third-party/${extensionName}`;
const LOCAL_STORAGE_KEY = `st-ext-${extensionName}-settings-v7`; // 版本号再升，确保测试干净状态

const defaultSettings = {
    enableBrCleanup: true,
    keepBrBetweenText: true,
    hideLeadingBrInMessage: true,
};

const ORIGINAL_DISPLAY_STYLE_ATTR = 'data-br-original-display';
const PROCESSED_BY_PLUGIN_ATTR = 'data-br-processed-by-cleanup';

let currentSettings = loadSettingsFromLocalStorage();
let isApplyingRules = false; // 用于防止 cleanupBrTags 重入
let lastScheduledCleanupId = null; // 用于管理 setTimeout/requestAnimationFrame

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

// --- DOM 操作核心 (与上一版v6基本一致，关键在于调用时机) ---
function revertBrModificationsInContainer(container) {
    if (!container || typeof container.querySelectorAll !== 'function') return;
    container.querySelectorAll(`br[${PROCESSED_BY_PLUGIN_ATTR}]`).forEach(br => {
        if (br.hasAttribute(ORIGINAL_DISPLAY_STYLE_ATTR)) {
            br.style.display = br.getAttribute(ORIGINAL_DISPLAY_STYLE_ATTR);
            br.removeAttribute(ORIGINAL_DISPLAY_STYLE_ATTR);
        } else {
            br.style.display = '';
        }
        br.removeAttribute(PROCESSED_BY_PLUGIN_ATTR);
    });
}

function getPreviousValidSibling(node) { /* ...不变... */ if(!node)return null;let s=node.previousSibling;while(s){if(s.nodeType===1||(s.nodeType===3&&s.textContent.trim()!==''))return s;s=s.previousSibling}return null }
function getNextValidSibling(node) { /* ...不变... */ if(!node)return null;let s=node.nextSibling;while(s){if(s.nodeType===1||(s.nodeType===3&&s.textContent.trim()!==''))return s;s=s.nextSibling}return null }
function isTextualNode(node) { /* ...不变... */ if(!node)return!1;if(node.nodeType===3&&node.textContent.trim()!=='')return!0;if(node.nodeType===1){const i=['SPAN','EM','STRONG','A','I','B','U','CODE','SAMP','KBD','VAR','SUB','SUP','Q','CITE','ABBR','DFN'];if(i.includes(node.nodeName.toUpperCase()))return!0;const t=['DIV','P','H1','H2','H3','H4','H5','H6','UL','OL','LI','BLOCKQUOTE','PRE','TABLE','HR','MAGIC_STATUS'];if(t.includes(node.nodeName.toUpperCase()))return!1}return!1}


function cleanupBrTags(source = "unknown_cleanup", specificMessageContainer = null) {
    if (isApplyingRules) {
        // console.log(`[${extensionName}] cleanupBrTags 跳过 (源: ${source}, isApplyingRules: true)`);
        return;
    }
    isApplyingRules = true;
    // console.time(`[${extensionName}] cleanupBrTags (${source})`);
    // console.log(`[${extensionName}] cleanupBrTags 执行开始 (源: ${source}, 特定容器: ${!!specificMessageContainer})`);

    const settings = currentSettings;

    try {
        const chatMessageSelectorsArray = [
            '.mes_text', '.mes .force-user-msg .mes_text', '.mes .force-char-msg .mes_text',
            'div[id^="chatMessage"] .mes_text', '.message-content', '.chitchat-text'
        ];
        const chatMessageQuerySelector = chatMessageSelectorsArray.join(', ');

        const containersToProcess = specificMessageContainer ?
            (specificMessageContainer.matches && specificMessageContainer.matches(chatMessageQuerySelector) ? [specificMessageContainer] : []) :
            Array.from(document.querySelectorAll(chatMessageQuerySelector)); // 转换为数组以便安全迭代

        if (containersToProcess.length === 0 && specificMessageContainer) {
            // console.log(`[${extensionName}] specificMessageContainer 未匹配任何聊天选择器，尝试直接处理:`, specificMessageContainer);
            // 如果 specificMessageContainer 存在但不是标准聊天容器，也尝试处理它（例如，如果是 .mes 本身）
            if (specificMessageContainer && typeof specificMessageContainer.querySelectorAll === 'function') {
                 containersToProcess.push(specificMessageContainer);
            }
        }


        containersToProcess.forEach(chatContainer => {
            if (!chatContainer || typeof chatContainer.querySelectorAll !== 'function') return;

            revertBrModificationsInContainer(chatContainer);

            if (!settings.enableBrCleanup) {
                return; // 如果总开关关闭，则恢复后直接返回
            }

            let brNodesInContainer = Array.from(chatContainer.querySelectorAll('br'));

            if (settings.hideLeadingBrInMessage) {
                let currentNode = chatContainer.firstChild;
                let nodesToHide = [];
                while (currentNode) {
                    if (currentNode.nodeType === Node.TEXT_NODE && currentNode.textContent.trim() !== '') break;
                    if (currentNode.nodeName === 'BR') {
                        nodesToHide.push(currentNode);
                    } else if (currentNode.nodeType === Node.ELEMENT_NODE && !isTextualNode(currentNode)) {
                        let nextAfterSpecial = getNextValidSibling(currentNode);
                        if (nextAfterSpecial && nextAfterSpecial.nodeName === 'BR') {
                            nodesToHide.push(nextAfterSpecial);
                        }
                        if (isTextualNode(nextAfterSpecial)) break;
                    } else if (currentNode.nodeType === Node.ELEMENT_NODE && isTextualNode(currentNode)) {
                        break;
                    }
                    currentNode = currentNode.nextSibling;
                }
                nodesToHide.forEach(br => {
                    if (br.style.display !== 'none') {
                        const currentDisplay = window.getComputedStyle(br).display;
                        if (currentDisplay !== 'none') br.setAttribute(ORIGINAL_DISPLAY_STYLE_ATTR, currentDisplay);
                        br.style.display = 'none';
                        br.setAttribute(PROCESSED_BY_PLUGIN_ATTR, 'true');
                    }
                });
                brNodesInContainer = brNodesInContainer.filter(br => !(br.style.display === 'none' && br.hasAttribute(PROCESSED_BY_PLUGIN_ATTR)));
            }


            brNodesInContainer.forEach(br => {
                if (br.style.display === 'none' && br.hasAttribute(PROCESSED_BY_PLUGIN_ATTR)) {
                    return; // 已被 hideLeadingBrInMessage 处理
                }

                let shouldKeep = false;
                if (settings.keepBrBetweenText) {
                    const prev = getPreviousValidSibling(br);
                    const next = getNextValidSibling(br);
                    if (isTextualNode(prev) && isTextualNode(next)) {
                        shouldKeep = true;
                    }
                }

                if (shouldKeep) {
                    // 确保可见，并标记
                    if (br.style.display === 'none') { // 不应发生，因为我们已经 filter 了
                         br.style.display = br.hasAttribute(ORIGINAL_DISPLAY_STYLE_ATTR) ? br.getAttribute(ORIGINAL_DISPLAY_STYLE_ATTR) : '';
                    }
                    br.setAttribute(PROCESSED_BY_PLUGIN_ATTR, 'true');
                } else {
                    // 默认隐藏其他所有
                    if (br.style.display !== 'none') {
                        const currentDisplay = window.getComputedStyle(br).display;
                         if (currentDisplay !== 'none') br.setAttribute(ORIGINAL_DISPLAY_STYLE_ATTR, currentDisplay);
                        br.style.display = 'none';
                        br.setAttribute(PROCESSED_BY_PLUGIN_ATTR, 'true');
                    }
                }
            });
        });
    } catch (error) {
        console.error(`[${extensionName}] 在 cleanupBrTags 执行期间发生错误 (源: ${source}):`, error);
    } finally {
        isApplyingRules = false;
        // console.timeEnd(`[${extensionName}] cleanupBrTags (${source})`);
        // console.log(`[${extensionName}] cleanupBrTags 执行完毕 (源: ${source})`);
    }
}

/**
 * 统一的延迟执行 cleanupBrTags 的函数，会清除之前的计划。
 * @param {string} source
 * @param {number} delayMs
 * @param {HTMLElement|null} specificContainer
 */
function scheduleCleanup(source, delayMs, specificContainer = null) {
    // console.log(`[${extensionName}] 计划 cleanup (源: ${source}, 延迟: ${delayMs}ms, 特定容器: ${!!specificContainer})`);
    if (lastScheduledCleanupId) {
        clearTimeout(lastScheduledCleanupId); // 清除上一个setTimeout
        // 如果是requestAnimationFrame，则用 cancelAnimationFrame(lastScheduledCleanupId)
    }
    lastScheduledCleanupId = setTimeout(() => {
        // 使用 requestAnimationFrame 确保在浏览器准备好绘制时执行，减少闪烁
        requestAnimationFrame(() => {
            cleanupBrTags(source, specificContainer);
        });
        lastScheduledCleanupId = null; // 执行后清除ID
    }, delayMs);
}


// --- UI 更新与事件处理 ---
function updateUIFromSettings() { /* ...不变... */ const s=currentSettings;$("#st-br-enable-cleanup").prop("checked",s.enableBrCleanup);$("#st-br-keep-between-text").prop("checked",s.keepBrBetweenText);$("#st-br-hide-leading-br").prop("checked",s.hideLeadingBrInMessage)}
function onSettingsChange(event) {
    const targetId = event.target.id;
    const checked = Boolean(event.target.checked);
    switch (targetId) {
        case 'st-br-enable-cleanup': currentSettings.enableBrCleanup = checked; break;
        case 'st-br-keep-between-text': currentSettings.keepBrBetweenText = checked; break;
        case 'st-br-hide-leading-br': currentSettings.hideLeadingBrInMessage = checked; break;
        default: return;
    }
    saveSettingsToLocalStorage(currentSettings);
    scheduleCleanup("settingsChange", 50); // 设置更改后，短延迟应用
}

// --- DOM 变化监听 (MutationObserver) ---
let chatObserver = null;
const ST_EDIT_TEXTAREA_SELECTOR = '.mes_textarea, textarea.auto-size';

function observeChatMessages() {
    const chatMessageSelectorsArray = [ /* ...同 cleanupBrTags 内的定义... */
        '.mes_text', '.mes .force-user-msg .mes_text', '.mes .force-char-msg .mes_text',
        'div[id^="chatMessage"] .mes_text', '.message-content', '.chitchat-text'
    ];
    const chatMessageQuerySelector = chatMessageSelectorsArray.join(', ');

    const chatAreaSelectors = ['#chat', '.chat-messages-container', '.message_chat']; // 优先选择更具体的聊天区域
    let mainChatArea = null;
    for (const selector of chatAreaSelectors) {
        mainChatArea = document.querySelector(selector);
        if (mainChatArea) break;
    }
    if (!mainChatArea) {
        console.warn(`[${extensionName}] 未找到主要聊天区域，MutationObserver 将监听 document.body。`);
        mainChatArea = document.body;
    }

    if (chatObserver) chatObserver.disconnect();

    chatObserver = new MutationObserver((mutationsList) => {
        let needsGlobalCleanupDebounced = false;
        let processedEditExit = false; // 标记是否已处理了本次mutation中的编辑退出

        for (const mutation of mutationsList) {
            if (mutation.type === 'childList') {
                // 进入编辑模式
                for (const node of mutation.addedNodes) {
                    if (node.nodeType === Node.ELEMENT_NODE && node.matches && node.matches(ST_EDIT_TEXTAREA_SELECTOR)) {
                        const editedContainer = node.closest(chatMessageQuerySelector);
                        if (editedContainer) {
                            // console.log(`[${extensionName}] MO: 进入编辑，恢复BR于:`, editedContainer);
                            revertBrModificationsInContainer(editedContainer);
                            processedEditExit = true; // 标记本次mutation是编辑相关的，避免全局刷新
                        }
                        break;
                    }
                }
                if (processedEditExit) continue; // 如果是进入编辑，不检查后续，等待退出编辑

                // 退出编辑模式
                for (const node of mutation.removedNodes) {
                    if (node.nodeType === Node.ELEMENT_NODE && node.matches && node.matches(ST_EDIT_TEXTAREA_SELECTOR)) {
                        const parentOfTextarea = mutation.target;
                        const exitedContainer = parentOfTextarea.closest(chatMessageQuerySelector);
                        if (exitedContainer) {
                            // console.log(`[${extensionName}] MO: 退出编辑，处理:`, exitedContainer);
                            scheduleCleanup("edit_mode_exit_mo", 150, exitedContainer); // 稍快反应
                            processedEditExit = true;
                        } else {
                            needsGlobalCleanupDebounced = true; // 找不到特定容器，准备全局
                        }
                        break;
                    }
                }
                if (processedEditExit) continue; // 如果是退出编辑，不检查后续

                // 新消息添加 (非编辑模式触发)
                if (!processedEditExit) {
                    for (const node of mutation.addedNodes) {
                        if (node.nodeType === Node.ELEMENT_NODE && node.matches && (node.matches('.mes') || node.querySelector('.mes_text'))) {
                            // console.log(`[${extensionName}] MO: 新消息添加，准备全局清理。`);
                            needsGlobalCleanupDebounced = true;
                            break;
                        }
                    }
                }
            }
            if (needsGlobalCleanupDebounced) break; // 如果已确定需要全局清理，跳出
        }

        if (needsGlobalCleanupDebounced && !processedEditExit) { // 确保不是编辑操作导致的全局清理
            scheduleCleanup("mutationObserver_global_debounced", 400); // 全局清理用稍长防抖
        }
    });
    chatObserver.observe(mainChatArea, { childList: true, subtree: true });
    // console.log(`[${extensionName}] MutationObserver已启动，监听目标:`, mainChatArea);
}

// --- SillyTavern 事件集成 ---
function setupSillyTavernEventListeners() {
    try {
        import('../../../../script.js')
            .then(module => {
                eventSourceInstance = module.eventSource;
                eventTypesInstance = module.event_types;
                if (eventSourceInstance && eventTypesInstance) {
                    // AI回复是最需要快速响应的
                    eventSourceInstance.on(eventTypesInstance.CHARACTER_MESSAGE_RECEIVED, () => scheduleCleanup("CHARACTER_MESSAGE_RECEIVED", 100)); // AI回复，延迟短一些
                    eventSourceInstance.on(eventTypesInstance.USER_MESSAGE_SENT, () => scheduleCleanup("USER_MESSAGE_SENT", 200));
                    // CHAT_UPDATED 通常在编辑保存后触发，这是关键
                    eventSourceInstance.on(eventTypesInstance.CHAT_UPDATED, (data) => {
                        // console.log(`[${extensionName}] ST Event: CHAT_UPDATED, data:`, data);
                        // CHAT_UPDATED 可能会传递被更新消息的ID或元素，但我们目前还是全局或基于MO的特定容器处理
                        scheduleCleanup("CHAT_UPDATED", 250); // 编辑后延迟
                    });
                    eventSourceInstance.on(eventTypesInstance.MESSAGE_SWIPED, () => scheduleCleanup("MESSAGE_SWIPED", 300));
                    eventSourceInstance.on(eventTypesInstance.CHAT_CHANGED, () => {
                        scheduleCleanup("CHAT_CHANGED_loadsettings", 700); // 给聊天切换最长延迟
                        // 在scheduleCleanup的回调中也可以做 currentSettings = loadSettingsFromLocalStorage(); updateUIFromSettings();
                        // 但为了简化，目前只在CHAT_CHANGED时，由scheduleCleanup内部的cleanupBrTags触发全局处理
                        // 如果确实需要在CHAT_CHANGED时重载设置并更新UI，可以这样做：
                        // clearTimeout(lastScheduledCleanupId);
                        // lastScheduledCleanupId = setTimeout(() => {
                        //     requestAnimationFrame(() => {
                        //         console.log(`[${extensionName}] CHAT_CHANGED: Reloading settings and UI.`);
                        //         currentSettings = loadSettingsFromLocalStorage();
                        //         updateUIFromSettings();
                        //         cleanupBrTags("CHAT_CHANGED_completed");
                        //     });
                        // }, 700);
                    });
                    // console.log(`[${extensionName}] ST事件监听器已设置。`);
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
            if (typeof toastr !== 'undefined') toastr.info("手动应用BR清理规则...", extensionName, { timeOut: 1000 });
            scheduleCleanup("manualApplyButton", 0); // 手动应用，无延迟
        });

        currentSettings = loadSettingsFromLocalStorage();
        updateUIFromSettings();

        scheduleCleanup("initialLoad_delayed", 1000); // 初始加载给予最长延迟

        observeChatMessages();
        setupSillyTavernEventListeners();

        console.log(`[${extensionName}] 插件初始化成功 (v7). 使用存储键: ${LOCAL_STORAGE_KEY}`);

    } catch (error) {
        console.error(`[${extensionName}] 初始化严重错误:`, error, error.stack);
        if (typeof toastr !== 'undefined') toastr.error(`插件 "${extensionName}" 初始化失败。查看控制台。`, "插件错误", { timeOut: 0 });
        alert(`插件 "${extensionName}" 初始化错误。F12查看控制台。`);
    }
});
