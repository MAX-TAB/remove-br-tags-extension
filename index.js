// remove-br-tags-extension/index.js

// --- 常量和全局变量 ---
const extensionName = "remove-br-tags-extension";
const extensionFolderPath = `scripts/extensions/third-party/${extensionName}`;
const LOCAL_STORAGE_KEY = `st-ext-${extensionName}-settings-v6`;

const defaultSettings = {
    enableBrCleanup: true,
    keepBrBetweenText: true,
    hideLeadingBrInMessage: true,
};

const ORIGINAL_DISPLAY_STYLE_ATTR = 'data-br-original-display';
const PROCESSED_BY_PLUGIN_ATTR = 'data-br-processed-by-cleanup';

let currentSettings = loadSettingsFromLocalStorage();
let isApplyingRules = false;
let applyRulesTimeoutId = null;

// --- 设置加载与保存 ---
function loadSettingsFromLocalStorage() {
    try {
        const storedSettings = localStorage.getItem(LOCAL_STORAGE_KEY);
        if (storedSettings) {
            const parsedSettings = JSON.parse(storedSettings);
            return { ...defaultSettings, ...parsedSettings };
        }
    } catch (error) {
        console.error(`[${extensionName}] 加载设置错误:`, error);
    }
    return { ...defaultSettings };
}

function saveSettingsToLocalStorage(settings) {
    try {
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(settings));
    } catch (error) {
        console.error(`[${extensionName}] 保存设置错误:`, error);
    }
}

// --- DOM 操作核心 ---
function revertBrModificationsInContainer(container) {
    if (!container || typeof container.querySelectorAll !== 'function') return; // 安全检查
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

function getPreviousValidSibling(node) {
    if (!node) return null;
    let sibling = node.previousSibling;
    while (sibling) {
        if (sibling.nodeType === Node.ELEMENT_NODE) return sibling;
        if (sibling.nodeType === Node.TEXT_NODE && sibling.textContent.trim() !== '') return sibling;
        sibling = sibling.previousSibling;
    }
    return null;
}

function getNextValidSibling(node) {
    if (!node) return null;
    let sibling = node.nextSibling;
    while (sibling) {
        if (sibling.nodeType === Node.ELEMENT_NODE) return sibling;
        if (sibling.nodeType === Node.TEXT_NODE && sibling.textContent.trim() !== '') return sibling;
        sibling = sibling.nextSibling;
    }
    return null;
}

function isTextualNode(node) {
    if (!node) return false;
    if (node.nodeType === Node.TEXT_NODE && node.textContent.trim() !== '') return true;
    if (node.nodeType === Node.ELEMENT_NODE) {
        const inlineTextContainers = ['SPAN', 'EM', 'STRONG', 'A', 'I', 'B', 'U', 'CODE', 'SAMP', 'KBD', 'VAR', 'SUB', 'SUP', 'Q', 'CITE', 'ABBR', 'DFN'];
        if (inlineTextContainers.includes(node.nodeName.toUpperCase())) return true;
        const blockOrSpecialElements = ['DIV', 'P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'UL', 'OL', 'LI', 'BLOCKQUOTE', 'PRE', 'TABLE', 'HR', 'MAGIC_STATUS'];
        if (blockOrSpecialElements.includes(node.nodeName.toUpperCase())) return false;
        // 对于其他未明确的元素节点，如果其子节点中没有块级元素，可以认为它是文本容器的延续
        // 为简化，此处不做更深层判断
        return false;
    }
    return false;
}

function cleanupBrTags(source = "unknown_cleanup", specificMessageContainer = null) {
    if (isApplyingRules) {
        // console.log(`[${extensionName}] cleanupBrTags 跳过 (源: ${source}, isApplyingRules: true)`);
        return;
    }
    isApplyingRules = true;
    // console.time(`[${extensionName}] cleanupBrTags (${source})`);

    const settings = currentSettings;

    try {
        const chatMessageSelectorsArray = [ // 确保这是一个数组
            '.mes_text', '.mes .force-user-msg .mes_text', '.mes .force-char-msg .mes_text',
            'div[id^="chatMessage"] .mes_text', '.message-content', '.chitchat-text'
        ];
        const chatMessageQuerySelector = chatMessageSelectorsArray.join(', '); // 正确生成查询字符串

        const containersToProcess = specificMessageContainer ?
            (specificMessageContainer.matches && specificMessageContainer.matches(chatMessageQuerySelector) ? [specificMessageContainer] : []) : // 检查 matches 方法是否存在
            document.querySelectorAll(chatMessageQuerySelector);

        containersToProcess.forEach(chatContainer => {
            if (!chatContainer || typeof chatContainer.querySelectorAll !== 'function') return;

            revertBrModificationsInContainer(chatContainer);

            if (!settings.enableBrCleanup) {
                return;
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
                        if (isTextualNode(nextAfterSpecial)) break; // 如果后面是文本，则开头扫描结束
                    } else if (currentNode.nodeType === Node.ELEMENT_NODE && isTextualNode(currentNode)) {
                        // 如果是一个文本性元素（如<span>text</span>），则认为开头扫描结束
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
                // 更新brNodesInContainer，排除已被隐藏的
                brNodesInContainer = brNodesInContainer.filter(br => br.style.display !== 'none' || !br.hasAttribute(PROCESSED_BY_PLUGIN_ATTR));
            }


            brNodesInContainer.forEach(br => {
                // 如果已被其他规则隐藏，跳过 (虽然上面已经 filter 了一次，双重保险)
                if (br.style.display === 'none' && br.hasAttribute(PROCESSED_BY_PLUGIN_ATTR)) {
                    return;
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
                    if (br.style.display === 'none') { // 理论上不应是none，因为上面filter了
                        if (br.hasAttribute(ORIGINAL_DISPLAY_STYLE_ATTR)) {
                            br.style.display = br.getAttribute(ORIGINAL_DISPLAY_STYLE_ATTR);
                        } else {
                            br.style.display = '';
                        }
                    }
                    br.setAttribute(PROCESSED_BY_PLUGIN_ATTR, 'true');
                } else {
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
    }
}

// --- UI 更新与事件处理 ---
function updateUIFromSettings() {
    const s = currentSettings;
    $('#st-br-enable-cleanup').prop('checked', s.enableBrCleanup);
    $('#st-br-keep-between-text').prop('checked', s.keepBrBetweenText);
    $('#st-br-hide-leading-br').prop('checked', s.hideLeadingBrInMessage);
}

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
    requestAnimationFrame(() => cleanupBrTags("settingsChange"));
}

// --- DOM 变化监听 (MutationObserver) ---
let chatObserver = null;
const ST_EDIT_TEXTAREA_SELECTOR = '.mes_textarea, textarea.auto-size'; // SillyTavern编辑框选择器

function observeChatMessages() {
    const debouncedCleanup = debounce(() => {
        requestAnimationFrame(() => cleanupBrTags("mutationObserver_debounced"));
    }, 400); // 增加防抖延迟

    // 聊天区域选择器，更精确一点
    const chatAreaSelectors = ['#chat', '.chat-messages-container', '.message_chat'];
    let mainChatArea = null;
    for (const selector of chatAreaSelectors) {
        mainChatArea = document.querySelector(selector);
        if (mainChatArea) break;
    }
    // 如果找不到精确的，再回退到body，但给出警告
    if (!mainChatArea) {
        console.warn(`[${extensionName}] 未找到精确的聊天区域，MutationObserver 将监听 body。`);
        mainChatArea = document.body;
    }

    if (chatObserver) chatObserver.disconnect();

    chatObserver = new MutationObserver((mutationsList) => {
        let needsGlobalCleanup = false;
        let editedMessageContainer = null; // 用于标记是否是编辑操作相关的DOM变化

        for (const mutation of mutationsList) {
            if (mutation.type === 'childList') {
                // 检测进入编辑模式 (textarea 添加)
                for (const node of mutation.addedNodes) {
                    if (node.nodeType === Node.ELEMENT_NODE && node.matches && node.matches(ST_EDIT_TEXTAREA_SELECTOR)) {
                        // 获取 textarea 所在的父消息容器
                        editedMessageContainer = node.closest(chatMessageSelectorsArray.join(', '));
                        if (editedMessageContainer) {
                            // console.log(`[${extensionName}] 进入编辑模式，恢复此容器BR:`, editedMessageContainer);
                            revertBrModificationsInContainer(editedMessageContainer); // 恢复原始BR供编辑
                        }
                        break; // 找到编辑框，跳出内层addedNodes循环
                    }
                }
                if (editedMessageContainer) break; // 如果已处理编辑框添加，跳出外层mutationsList循环

                // 检测退出编辑模式 (textarea 移除)
                for (const node of mutation.removedNodes) {
                    if (node.nodeType === Node.ELEMENT_NODE && node.matches && node.matches(ST_EDIT_TEXTAREA_SELECTOR)) {
                        // mutation.target 是 textarea 被移除前其所在的父节点
                        editedMessageContainer = mutation.target.closest(chatMessageSelectorsArray.join(', '));
                        if (editedMessageContainer) {
                            // console.log(`[${extensionName}] 退出编辑模式，处理此容器:`, editedMessageContainer);
                            clearTimeout(applyRulesTimeoutId); // 清除可能存在的全局延迟调用
                            // 针对性、稍延迟地处理这个刚编辑完的容器
                            applyRulesTimeoutId = setTimeout(() => requestAnimationFrame(() => cleanupBrTags("edit_mode_exit", editedMessageContainer)), 200);
                        } else {
                            // 如果找不到特定容器（理论上不应发生），则标记需要全局清理
                            needsGlobalCleanup = true;
                        }
                        break; // 找到移除的编辑框
                    }
                }
                if (editedMessageContainer) break; // 如果已处理编辑框移除，跳出外层

                // 检测新消息添加 (非编辑模式触发时)
                if (!editedMessageContainer) {
                    for (const node of mutation.addedNodes) {
                        // 检查添加的节点是否是消息本身或包含消息文本的元素
                        if (node.nodeType === Node.ELEMENT_NODE && node.matches && (node.matches('.mes') || node.querySelector('.mes_text'))) {
                            needsGlobalCleanup = true;
                            break;
                        }
                    }
                }
            }
            // 如果已标记需要全局清理或已处理编辑容器，则不再检查其他mutation记录
            if (needsGlobalCleanup || editedMessageContainer) break;
        }

        // 只有在确实需要全局清理，并且不是因为编辑操作触发时，才调用debouncedCleanup
        if (needsGlobalCleanup && !editedMessageContainer) {
            debouncedCleanup();
        }
    });
    chatObserver.observe(mainChatArea, { childList: true, subtree: true });
    // console.log(`[${extensionName}] MutationObserver已启动，监听目标:`, mainChatArea);
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
let eventSourceInstance, eventTypesInstance; // 在外部声明，以便模块加载后赋值
function setupSillyTavernEventListeners() {
    try {
        import('../../../../script.js') // 确保路径正确
            .then(module => {
                eventSourceInstance = module.eventSource;
                eventTypesInstance = module.event_types;
                if (eventSourceInstance && eventTypesInstance) {
                    const cleanupAfterEvent = (source, delay = 350, specificTarget = null) => { // 增加默认延迟
                        clearTimeout(applyRulesTimeoutId);
                        applyRulesTimeoutId = setTimeout(() => requestAnimationFrame(() => cleanupBrTags(source, specificTarget)), delay);
                    };
                    eventSourceInstance.on(eventTypesInstance.CHAT_UPDATED, () => cleanupAfterEvent("CHAT_UPDATED", 450)); // 编辑后给更长延迟
                    eventSourceInstance.on(eventTypesInstance.MESSAGE_SWIPED, () => cleanupAfterEvent("MESSAGE_SWIPED", 380));
                    eventSourceInstance.on(eventTypesInstance.USER_MESSAGE_SENT, () => cleanupAfterEvent("USER_MESSAGE_SENT", 320));
                    eventSourceInstance.on(eventTypesInstance.CHARACTER_MESSAGE_RECEIVED, () => cleanupAfterEvent("CHARACTER_MESSAGE_RECEIVED", 320));
                    eventSourceInstance.on(eventTypesInstance.CHAT_CHANGED, () => {
                        clearTimeout(applyRulesTimeoutId);
                        applyRulesTimeoutId = setTimeout(() => {
                            requestAnimationFrame(() => {
                                currentSettings = loadSettingsFromLocalStorage();
                                updateUIFromSettings();
                                cleanupBrTags("CHAT_CHANGED_completed");
                            });
                        }, 850); // 切换聊天给最长延迟
                    });
                    // console.log(`[${extensionName}] ST事件监听器已设置。`);
                } else {
                    // console.warn(`[${extensionName}] eventSource 或 event_types 未从 script.js 正确导入。`);
                }
            })
            .catch(err => {
                // console.warn(`[${extensionName}] 从 script.js 导入 ST 事件系统失败:`, err.message);
            });
    } catch (e) {
        // console.warn(`[${extensionName}] 尝试导入 ST 事件系统时发生同步错误:`, e.message);
    }
}

// --- 初始化 ---
jQuery(async () => { // 确保 jQuery 已加载
    try {
        // 确保 settings.html 中的 ID 与 jQuery 选择器匹配
        const settingsHtmlPath = `${extensionFolderPath}/settings.html`;
        const settingsHtml = await $.get(settingsHtmlPath); // 使用 jQuery 的 $.get
        const $extensionsSettingsContainer = $("#extensions_settings"); // jQuery 对象

        if ($extensionsSettingsContainer.length) { // 检查jQuery对象是否找到了元素
            $extensionsSettingsContainer.append(settingsHtml);
        } else {
            console.warn(`[${extensionName}] #extensions_settings 容器未找到。设置面板可能无法显示。`);
        }

        // 事件委托，确保即使HTML是后加载的，事件也能绑定
        // 确保 settings.html 的根 div 有 id="remove-br-tags-extension-settings-container"
        $(document).on('input', '#remove-br-tags-extension-settings-container input[type="checkbox"]', onSettingsChange);
        $(document).on('click', '#remove-br-tags-extension-settings-container #st-br-apply-rules-now', () => {
            if (typeof toastr !== 'undefined') {
                toastr.info("手动应用BR清理规则...", extensionName, { timeOut: 1000 });
            }
            requestAnimationFrame(() => cleanupBrTags("manualApplyButton"));
        });

        currentSettings = loadSettingsFromLocalStorage();
        updateUIFromSettings(); // 确保UI在HTML附加后更新

        // 首次加载时，给予更长的延迟，确保所有内容（包括聊天）都已渲染
        requestAnimationFrame(() => {
            setTimeout(() => {
                cleanupBrTags("initialLoad_delayed");
            }, 1000); // 增加到1秒
        });

        observeChatMessages();
        setupSillyTavernEventListeners();

        console.log(`[${extensionName}] 插件初始化成功 (v6). 使用存储键: ${LOCAL_STORAGE_KEY}`);

    } catch (error) {
        console.error(`[${extensionName}] 初始化过程中发生严重错误:`, error, error.stack); // 添加错误堆栈
        if (typeof toastr !== 'undefined') {
            toastr.error(`插件 "${extensionName}" 初始化失败。详情请查看浏览器控制台。`, "插件错误", { timeOut: 0 });
        }
        alert(`插件 "${extensionName}" 初始化时发生严重错误，可能无法正常工作。请按F12打开浏览器控制台，查看详细的错误信息和堆栈。`);
    }
});
