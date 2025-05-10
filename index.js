// remove-br-tags-extension/index.js

const extensionName = "remove-br-tags-extension";
const extensionFolderPath = `scripts/extensions/third-party/${extensionName}`;
const LOCAL_STORAGE_KEY = `st-ext-${extensionName}-settings-v2`; // v2 用于区分旧设置

const defaultSettings = {
    // 聊天消息相关
    chatHideAllBr: false,          // 是否隐藏所有聊天消息中的 <br>
    chatHideLeadingBr: true,       // 是否隐藏聊天消息开头的 <br>
    chatMergeConsecutiveBr: true,  // 是否合并聊天消息中连续的 <br>
    chatSmartExternalBr: false,    // 实验性：智能保留聊天内被包裹的 <br>

    // 全局相关
    globalHideAllBr: false,        // 是否隐藏全局的 <br>
};

// 用于在DOM操作后恢复<br>原始display属性的标记
const ORIGINAL_DISPLAY_ATTR = 'data-original-display';
const PROCESSED_BY_PLUGIN_ATTR = 'data-br-processed'; // 标记已被插件处理过的<br>

// 存储设置和应用规则的逻辑
let currentSettings = loadSettingsFromLocalStorage();

function loadSettingsFromLocalStorage() {
    try {
        const storedSettings = localStorage.getItem(LOCAL_STORAGE_KEY);
        if (storedSettings) {
            const parsedSettings = JSON.parse(storedSettings);
            return { ...defaultSettings, ...parsedSettings };
        }
    } catch (error) {
        console.error(`[${extensionName}] Error loading settings from localStorage:`, error);
    }
    return { ...defaultSettings };
}

function saveSettingsToLocalStorage(settings) {
    try {
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(settings));
    } catch (error) {
        console.error(`[${extensionName}] Error saving settings to localStorage:`, error);
    }
}

/**
 * 恢复所有被插件修改过的 <br> 标签到其原始显示状态或默认状态。
 * 在应用新规则前调用，或在禁用插件时调用。
 */
function revertAllBrModifications() {
    document.querySelectorAll(`br[${PROCESSED_BY_PLUGIN_ATTR}]`).forEach(br => {
        const originalDisplay = br.getAttribute(ORIGINAL_DISPLAY_ATTR);
        if (originalDisplay) {
            br.style.display = originalDisplay;
        } else {
            // 如果没有原始值，尝试恢复到 'revert' 或 'initial'
            // 对于 <br> 标签, 'initial' 或 'block' 或 'inline' 都可以
            br.style.display = ''; // 移除内联样式，让CSS规则生效
        }
        br.removeAttribute(ORIGINAL_DISPLAY_ATTR);
        br.removeAttribute(PROCESSED_BY_PLUGIN_ATTR);
    });
    // console.log(`[${extensionName}] Reverted all BR modifications.`);
}


/**
 * 核心函数：应用BR处理规则
 */
function applyBrRules() {
    console.time(`[${extensionName}] applyBrRules`);
    // 首先，恢复之前所有由本插件进行的修改，确保一个干净的开始状态
    revertAllBrModifications();

    const settings = currentSettings;

    // 全局隐藏所有 <br> (优先级最高，如果启用，则其他规则不重要)
    if (settings.globalHideAllBr) {
        document.querySelectorAll('body br').forEach(br => {
            if (!br.hasAttribute(PROCESSED_BY_PLUGIN_ATTR)) {
                const currentDisplay = window.getComputedStyle(br).display;
                if (currentDisplay !== 'none') {
                    br.setAttribute(ORIGINAL_DISPLAY_ATTR, currentDisplay);
                }
                br.style.display = 'none';
                br.setAttribute(PROCESSED_BY_PLUGIN_ATTR, 'true');
            }
        });
        console.timeEnd(`[${extensionName}] applyBrRules`);
        // toastr.info("全局隐藏所有 <br> 已应用。", extensionName, {timeOut:1500});
        return; // 如果全局隐藏，则不处理后续聊天规则
    }

    // 处理聊天消息中的 <br>
    // SillyTavern的聊天消息通常在 '.mes_text' 或类似的容器中
    const chatMessageSelectors = [
        '.mes_text',
        '.mes .force-user-msg .mes_text', // 补充选择器
        '.mes .force-char-msg .mes_text', // 补充选择器
        'div[id^="chatMessage"] .mes_text', // 针对一些可能的聊天结构
        '.message-content', // 另一个常见类名
    ];

    document.querySelectorAll(chatMessageSelectors.join(', ')).forEach(chatContainer => {
        // 规则1: 隐藏所有聊天消息中的 <br> (如果启用)
        if (settings.chatHideAllBr) {
            chatContainer.querySelectorAll('br').forEach(br => {
                if (!br.hasAttribute(PROCESSED_BY_PLUGIN_ATTR)) {
                    const currentDisplay = window.getComputedStyle(br).display;
                    if (currentDisplay !== 'none') {
                        br.setAttribute(ORIGINAL_DISPLAY_ATTR, currentDisplay);
                    }
                    br.style.display = 'none';
                    br.setAttribute(PROCESSED_BY_PLUGIN_ATTR, 'true');
                }
            });
            return; // 如果此容器内所有br都隐藏了，则跳过此容器的其他规则
        }

        const brNodesInContainer = Array.from(chatContainer.querySelectorAll('br'));

        // 规则2: 隐藏聊天消息开头的 <br>
        if (settings.chatHideLeadingBr) {
            let firstNode = chatContainer.firstChild;
            while (firstNode && firstNode.nodeType === Node.TEXT_NODE && firstNode.textContent.trim() === '') {
                firstNode = firstNode.nextSibling; // 跳过开头的空白文本节点
            }
            if (firstNode && firstNode.nodeName === 'BR' && !firstNode.hasAttribute(PROCESSED_BY_PLUGIN_ATTR)) {
                const currentDisplay = window.getComputedStyle(firstNode).display;
                if (currentDisplay !== 'none') {
                    firstNode.setAttribute(ORIGINAL_DISPLAY_ATTR, currentDisplay);
                }
                firstNode.style.display = 'none';
                firstNode.setAttribute(PROCESSED_BY_PLUGIN_ATTR, 'true');
            }
        }

        // 规则3: 合并连续的 <br> (保留一个)
        if (settings.chatMergeConsecutiveBr) {
            for (let i = 0; i < brNodesInContainer.length - 1; i++) {
                const currentBr = brNodesInContainer[i];
                if (currentBr.hasAttribute(PROCESSED_BY_PLUGIN_ATTR) && currentBr.style.display === 'none') continue; // 如果当前br已被隐藏，跳过

                let nextSibling = currentBr.nextSibling;
                // 跳过空白文本节点寻找下一个 BR
                while(nextSibling && nextSibling.nodeType === Node.TEXT_NODE && nextSibling.textContent.trim() === '') {
                    nextSibling = nextSibling.nextSibling;
                }

                if (nextSibling && nextSibling.nodeName === 'BR') {
                    const nextBr = nextSibling;
                    if (!nextBr.hasAttribute(PROCESSED_BY_PLUGIN_ATTR)) {
                        const currentDisplay = window.getComputedStyle(nextBr).display;
                        if (currentDisplay !== 'none') {
                            nextBr.setAttribute(ORIGINAL_DISPLAY_ATTR, currentDisplay);
                        }
                        nextBr.style.display = 'none'; // 隐藏连续的BR中的后续BR
                        nextBr.setAttribute(PROCESSED_BY_PLUGIN_ATTR, 'true');
                        // 因为brNodesInContainer是快照，这里修改了DOM，对后续迭代索引没影响，但被隐藏的BR会被标记
                    }
                }
            }
        }

        // 规则4: 智能保留被包裹的 <br> (实验性)
        // 这个规则应该在其他隐藏规则之后应用，以决定是否“豁免”某些 <br>
        if (settings.chatSmartExternalBr) {
            const significantWrappers = ['P', 'DIV', 'LI', 'BLOCKQUOTE', 'PRE', 'TD', 'TH', 'SECTION', 'ARTICLE', 'ASIDE', 'MAIN', 'HEADER', 'FOOTER', 'NAV']; // 可根据需要扩展
            chatContainer.querySelectorAll(`br:not([${PROCESSED_BY_PLUGIN_ATTR}*="true"])`).forEach(br => { // 只处理尚未被其他规则隐藏的br
                 // 或者处理所有BR，然后决定是否要取消隐藏: querySelectorAll('br')
            // chatContainer.querySelectorAll('br').forEach(br => {
                let parent = br.parentElement;
                let isWrapped = false;
                while(parent && parent !== chatContainer) {
                    if (significantWrappers.includes(parent.nodeName)) {
                        isWrapped = true;
                        break;
                    }
                    parent = parent.parentElement;
                }

                if (isWrapped) { // 如果BR被有意义的标签包裹
                    // 如果它之前被其他规则隐藏了，现在我们因为这个规则要显示它
                    if (br.style.display === 'none' && br.hasAttribute(PROCESSED_BY_PLUGIN_ATTR)) {
                         const originalDisplay = br.getAttribute(ORIGINAL_DISPLAY_ATTR);
                         br.style.display = originalDisplay || ''; // 恢复原始或默认
                         // 可以选择移除PROCESSED_BY_PLUGIN_ATTR或更新它的值
                         br.setAttribute(PROCESSED_BY_PLUGIN_ATTR, 'exempted-by-smart');
                    }
                    // 如果它本来就可见，且没有被处理过，则标记一下，防止被后续通用规则处理
                    else if (!br.hasAttribute(PROCESSED_BY_PLUGIN_ATTR)) {
                        //  br.setAttribute(PROCESSED_BY_PLUGIN_ATTR, 'kept-by-smart');
                        //  这个规则的目的是“保留”，所以如果br本来就可见，不需要做什么特别的显示操作
                    }
                } else { // 如果是“裸露”的BR，且此规则启用，则隐藏它 (除非已被其他规则隐藏)
                    // 这个逻辑有点复杂，因为"智能保留"意味着默认情况下其他"裸露"的会被隐藏
                    // 但我们不希望它覆盖 "chatHideAllBr: false" 的情况。
                    // 更好的做法是：如果启用了 smartExternalBr，那么只有 *不被* 包裹的才会被隐藏
                    // （如果 chatHideAllBr 是 false 的话）。
                    // 这个规则主要是为了在没有明确“全部隐藏”时，更智能地处理。
                    // 为简化，此实验性规则主要用于“豁免”已被其他规则隐藏的<br>。
                    // 如果需要更复杂的“仅隐藏裸露”逻辑，需要调整。
                }
            });
        }
    });
    console.timeEnd(`[${extensionName}] applyBrRules`);
    // toastr.success("BR 处理规则已应用。", extensionName, {timeOut:1500});
}


/**
 * 更新UI元素（复选框）的状态以匹配当前设置
 */
function updateUIFromSettings() {
    const s = currentSettings;
    $('#st-br-chat-hide-all').prop('checked', s.chatHideAllBr);
    $('#st-br-chat-hide-leading').prop('checked', s.chatHideLeadingBr);
    $('#st-br-chat-merge-consecutive').prop('checked', s.chatMergeConsecutiveBr);
    $('#st-br-chat-smart-external').prop('checked', s.chatSmartExternalBr);
    $('#st-br-global-hide-all').prop('checked', s.globalHideAllBr);
    // console.log(`[${extensionName}] UI updated from settings.`);
}

/**
 * 当任何设置复选框的值改变时调用
 * @param {Event} event
 */
function onSettingsChange(event) {
    const targetId = event.target.id;
    const checked = Boolean(event.target.checked);

    switch (targetId) {
        case 'st-br-chat-hide-all':          currentSettings.chatHideAllBr = checked; break;
        case 'st-br-chat-hide-leading':      currentSettings.chatHideLeadingBr = checked; break;
        case 'st-br-chat-merge-consecutive': currentSettings.chatMergeConsecutiveBr = checked; break;
        case 'st-br-chat-smart-external':
            currentSettings.chatSmartExternalBr = checked;
            if (checked) {
                toastr.info("“智能保留”规则是实验性的，可能需要调整聊天消息选择器以获得最佳效果。", "实验性功能", {timeOut: 5000});
            }
            break;
        case 'st-br-global-hide-all':
            currentSettings.globalHideAllBr = checked;
            if (checked) {
                toastr.warning("全局隐藏 <br> 已启用。如果界面显示异常，请禁用此选项。", "BR标签控制警告", { timeOut: 7000, preventDuplicates: true });
            }
            break;
        default:
            console.warn(`[${extensionName}] Unknown setting ID changed: ${targetId}`);
            return;
    }

    saveSettingsToLocalStorage(currentSettings);
    applyBrRules(); // 立即应用新规则
}

// MutationObserver 来监听聊天内容的动态添加
let chatObserver = null;
function observeChatMessages() {
    const debouncedApplyBrRules = debounce(applyBrRules, 300); // 防抖处理，避免过于频繁的执行

    const mainChatArea = document.getElementById('chat') || document.querySelector('.chat-messages-container') || document.body; // 尝试找到聊天区域的根元素

    if (chatObserver) {
        chatObserver.disconnect();
    }

    chatObserver = new MutationObserver((mutationsList, observer) => {
        let relevantMutation = false;
        for(const mutation of mutationsList) {
            if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
                // 检查添加的节点是否是聊天消息或包含聊天消息
                for (const node of mutation.addedNodes) {
                    if (node.nodeType === Node.ELEMENT_NODE) {
                         // .mes 是 SillyTavern 聊天消息的常见父类
                        if (node.matches && (node.matches('.mes') || node.querySelector('.mes_text'))) {
                            relevantMutation = true;
                            break;
                        }
                    }
                }
            }
            if (relevantMutation) break;
        }

        if (relevantMutation) {
            // console.log(`[${extensionName}] Chat content changed, re-applying BR rules.`);
            debouncedApplyBrRules();
        }
    });

    chatObserver.observe(mainChatArea, { childList: true, subtree: true });
    // console.log(`[${extensionName}] MutationObserver started for chat messages.`);
}

// 简单的防抖函数
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


// 插件初始化
jQuery(async () => {
    try {
        const settingsHtmlPath = `${extensionFolderPath}/settings.html`;
        const settingsHtml = await $.get(settingsHtmlPath);
        $("#extensions_settings").append(settingsHtml);

        // 绑定设置更改事件
        $('#extensions_settings').on('input', '.br-tags-control-settings input[type="checkbox"]', onSettingsChange);
        // 手动应用按钮
        $('#extensions_settings').on('click', '#st-br-apply-rules-now', () => {
            toastr.info("手动应用BR规则...", extensionName, {timeOut: 1000});
            applyBrRules();
        });


        currentSettings = loadSettingsFromLocalStorage(); // 确保加载最新的设置
        updateUIFromSettings(); // 根据加载的设置更新复选框状态
        applyBrRules();         // 首次加载时应用规则

        observeChatMessages(); // 开始监听聊天消息的变动

        console.log(`[${extensionName}] Advanced BR Control (using direct localStorage) initialized.`);

    } catch (error) {
        console.error(`[${extensionName}] Error during initialization:`, error);
        toastr.error(`插件 "${extensionName}" 初始化失败。详情请查看浏览器控制台。`, "插件错误");
    }
});

// 当SillyTavern的聊天发生变化时，也尝试重新应用规则 (作为MutationObserver的补充或备用)
// 这个事件可能不总是能精确捕捉到所有类型的聊天更新
import { eventSource, event_types } from '../../../../script.js';
if (eventSource && event_types) {
    const debouncedApplyBrRulesOnEvent = debounce(applyBrRules, 500);
    eventSource.on(event_types.CHAT_UPDATED, debouncedApplyBrRulesOnEvent);
    eventSource.on(event_types.MESSAGE_SWIPED, debouncedApplyBrRulesOnEvent);
    // eventSource.on(event_types.USER_MESSAGE_SENT, debouncedApplyBrRulesOnEvent); // 可能过于频繁
    // eventSource.on(event_types.CHARACTER_MESSAGE_RECEIVED, debouncedApplyBrRulesOnEvent); // 可能过于频繁
}
