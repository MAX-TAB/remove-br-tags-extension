// remove-br-tags-extension/index.js

const extensionName = "remove-br-tags-extension";
const extensionFolderPath = `scripts/extensions/third-party/${extensionName}`;
const LOCAL_STORAGE_KEY = `st-ext-${extensionName}-settings-v2`; // 使用v2以区分旧设置

const defaultSettings = {
    // 聊天消息相关
    chatHideAllBr: false,
    chatHideLeadingBr: true,
    chatMergeConsecutiveBr: true,
    chatSmartExternalBr: false,

    // 全局相关
    globalHideAllBr: false,
};

// 用于在DOM操作后恢复<br>原始display属性的标记
const ORIGINAL_DISPLAY_ATTR = 'data-original-display';
const PROCESSED_BY_PLUGIN_ATTR = 'data-br-processed';
const HIDDEN_BY_RULE_ATTR = 'data-br-hidden-by'; // 记录被哪个规则隐藏或豁免

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

function revertAllBrModifications() {
    document.querySelectorAll(`br[${PROCESSED_BY_PLUGIN_ATTR}]`).forEach(br => {
        const originalDisplay = br.getAttribute(ORIGINAL_DISPLAY_ATTR);
        br.style.display = originalDisplay || ''; // 恢复
        br.removeAttribute(ORIGINAL_DISPLAY_ATTR);
        br.removeAttribute(PROCESSED_BY_PLUGIN_ATTR);
        br.removeAttribute(HIDDEN_BY_RULE_ATTR);
    });
    // console.log(`[${extensionName}] Reverted all BR modifications.`);
}

function applyBrRules() {
    console.time(`[${extensionName}] applyBrRules`);
    revertAllBrModifications(); // 清理之前的修改
    const settings = currentSettings;

    function markBrAsHidden(brElement, ruleName) {
        if (!brElement) return;
        const currentDisplay = window.getComputedStyle(brElement).display;
        if (currentDisplay !== 'none') {
            brElement.setAttribute(ORIGINAL_DISPLAY_ATTR, currentDisplay);
        }
        brElement.style.display = 'none';
        brElement.setAttribute(PROCESSED_BY_PLUGIN_ATTR, 'true');
        brElement.setAttribute(HIDDEN_BY_RULE_ATTR, ruleName);
    }

    function markBrAsVisible(brElement, ruleName) {
        if (!brElement) return;
        // 仅当它被本插件隐藏时才恢复
        if (brElement.hasAttribute(PROCESSED_BY_PLUGIN_ATTR) && brElement.style.display === 'none') {
            const originalDisplay = brElement.getAttribute(ORIGINAL_DISPLAY_ATTR);
            brElement.style.display = originalDisplay || ''; // 恢复到原始或默认
            brElement.setAttribute(HIDDEN_BY_RULE_ATTR, `exempted_by_${ruleName}`);
        } else if (!brElement.hasAttribute(PROCESSED_BY_PLUGIN_ATTR)) {
            // 如果本来就可见且未被处理，标记为被此规则“保持”
            brElement.setAttribute(PROCESSED_BY_PLUGIN_ATTR, 'true');
            brElement.setAttribute(HIDDEN_BY_RULE_ATTR, `kept_by_${ruleName}`);
        }
    }

    if (settings.globalHideAllBr) {
        document.querySelectorAll('body br').forEach(br => markBrAsHidden(br, 'globalHideAllBr'));
        console.timeEnd(`[${extensionName}] applyBrRules`);
        return;
    }

    const chatMessageSelectors = [
        '.mes_text',
        '.mes .force-user-msg .mes_text',
        '.mes .force-char-msg .mes_text',
        'div[id^="chatMessage"] .mes_text', // 兼容一些变体
        '.message-content', // 另一个常见类名
    ];

    document.querySelectorAll(chatMessageSelectors.join(', ')).forEach(chatContainer => {
        if (settings.chatHideAllBr) {
            chatContainer.querySelectorAll('br').forEach(br => markBrAsHidden(br, 'chatHideAllBr'));
            return; // 此聊天容器处理完毕
        }

        // 当 chatHideAllBr 为 false 时，应用精细规则
        const brNodesInContainer = Array.from(chatContainer.querySelectorAll('br'));

        // 规则：隐藏聊天消息开头的 <br>
        if (settings.chatHideLeadingBr) {
            let firstNode = chatContainer.firstChild;
            while (firstNode && firstNode.nodeType === Node.TEXT_NODE && firstNode.textContent.trim() === '') {
                firstNode = firstNode.nextSibling;
            }
            if (firstNode && firstNode.nodeName === 'BR' && firstNode.style.display !== 'none') {
                markBrAsHidden(firstNode, 'chatHideLeadingBr');
            }
        }

        // 规则：合并连续的 <br> (保留第一个可见的，隐藏后续连续的)
        if (settings.chatMergeConsecutiveBr) {
            for (let i = 0; i < brNodesInContainer.length; i++) {
                const currentBr = brNodesInContainer[i];

                // 如果当前BR已经被隐藏，则它不能作为“保留的第一个”，跳过
                if (currentBr.style.display === 'none') {
                    continue;
                }

                let nextSignificantNode = currentBr.nextSibling;
                let isSequence = false;
                while (nextSignificantNode) {
                    if (nextSignificantNode.nodeType === Node.TEXT_NODE && nextSignificantNode.textContent.trim() === '') {
                        nextSignificantNode = nextSignificantNode.nextSibling;
                        continue;
                    }
                    if (nextSignificantNode.nodeName === 'BR') {
                        if (nextSignificantNode.style.display !== 'none') { // 只隐藏还可见的后续BR
                           markBrAsHidden(nextSignificantNode, 'chatMergeConsecutiveBr');
                        }
                        isSequence = true; // 标记找到了连续的BR
                        nextSignificantNode = nextSignificantNode.nextSibling;
                    } else {
                        break; // 非BR节点，序列中断
                    }
                }
                // 如果形成了一个序列，我们已经隐藏了后续的，可以跳过这些已处理的节点
                // 但由于brNodesInContainer是快照，且我们依赖style.display，简单迭代即可
            }
        }

        // 规则：智能保留/隐藏 (实验性)
        if (settings.chatSmartExternalBr) {
            const significantWrappers = ['P', 'DIV', 'LI', 'BLOCKQUOTE', 'PRE', 'TD', 'TH', 'SECTION', 'ARTICLE', 'ASIDE', 'MAIN', 'HEADER', 'FOOTER', 'NAV', 'SPAN'];

            brNodesInContainer.forEach(br => {
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
                    // 如果被包裹，并且它当前是隐藏的 (可能被 leading 或 merge 规则隐藏)
                    // 我们现在决定豁免它，让它显示出来
                    if (br.style.display === 'none' && br.hasAttribute(PROCESSED_BY_PLUGIN_ATTR)) {
                        const hiddenBy = br.getAttribute(HIDDEN_BY_RULE_ATTR);
                        // 只有当不是被更强的 chatHideAllBr 隐藏时才考虑豁免
                        if (hiddenBy && hiddenBy !== 'chatHideAllBr') {
                           markBrAsVisible(br, 'chatSmartExternalBr_exempt');
                        }
                    } else if (br.style.display !== 'none' && !br.hasAttribute(PROCESSED_BY_PLUGIN_ATTR)) {
                        // 如果它本来就可见，且未被处理，标记为被smart规则保留
                        markBrAsVisible(br, 'chatSmartExternalBr_kept');
                    }
                } else {
                    // 如果是“裸露”的BR，并且此规则启用，我们倾向于隐藏它
                    // 但仅当它当前可见时 (避免重复隐藏或与豁免冲突)
                    if (br.style.display !== 'none') {
                        markBrAsHidden(br, 'chatSmartExternalBr_hide_naked');
                    }
                }
            });
        }
    });
    console.timeEnd(`[${extensionName}] applyBrRules`);
}

function updateUIFromSettings() {
    const s = currentSettings;
    $('#st-br-chat-hide-all').prop('checked', s.chatHideAllBr);
    $('#st-br-chat-hide-leading').prop('checked', s.chatHideLeadingBr);
    $('#st-br-chat-merge-consecutive').prop('checked', s.chatMergeConsecutiveBr);
    $('#st-br-chat-smart-external').prop('checked', s.chatSmartExternalBr);
    $('#st-br-global-hide-all').prop('checked', s.globalHideAllBr);
    // console.log(`[${extensionName}] UI updated from settings.`);
}

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
                toastr.info("“智能保留”规则是实验性的，可能需要调整。", "实验性功能", {timeOut: 5000});
            }
            break;
        case 'st-br-global-hide-all':
            currentSettings.globalHideAllBr = checked;
            if (checked) {
                toastr.warning("全局隐藏 <br> 已启用。如果界面显示异常，请禁用。", "警告", { timeOut: 7000, preventDuplicates: true });
            }
            break;
        default:
            console.warn(`[${extensionName}] Unknown setting ID changed: ${targetId}`);
            return;
    }

    saveSettingsToLocalStorage(currentSettings);
    applyBrRules();
}

let chatObserver = null;
function observeChatMessages() {
    const debouncedApplyBrRules = debounce(applyBrRules, 300);
    const mainChatArea = document.getElementById('chat') || document.querySelector('.chat-messages-container') || document.body;

    if (chatObserver) {
        chatObserver.disconnect();
    }

    chatObserver = new MutationObserver((mutationsList, observer) => {
        let relevantMutation = false;
        for(const mutation of mutationsList) {
            if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
                for (const node of mutation.addedNodes) {
                    if (node.nodeType === Node.ELEMENT_NODE && (node.matches('.mes') || node.querySelector('.mes_text') || node.classList.contains('message'))) {
                        relevantMutation = true;
                        break;
                    }
                }
            }
            if (relevantMutation) break;
        }
        if (relevantMutation) {
            debouncedApplyBrRules();
        }
    });

    if (mainChatArea) {
        chatObserver.observe(mainChatArea, { childList: true, subtree: true });
    } else {
        console.warn(`[${extensionName}] Could not find main chat area to observe.`);
    }
}

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

jQuery(async () => {
    try {
        const settingsHtmlPath = `${extensionFolderPath}/settings.html`;
        const settingsHtml = await $.get(settingsHtmlPath);
        $("#extensions_settings").append(settingsHtml);

        $('#extensions_settings').on('input', '.br-tags-control-settings input[type="checkbox"]', onSettingsChange);
        $('#extensions_settings').on('click', '#st-br-apply-rules-now', () => {
            toastr.info("手动应用BR规则...", extensionName, {timeOut: 1000});
            applyBrRules();
        });

        currentSettings = loadSettingsFromLocalStorage();
        updateUIFromSettings();
        applyBrRules();

        observeChatMessages();

        console.log(`[${extensionName}] Advanced BR Control (direct localStorage) initialized.`);

    } catch (error) {
        console.error(`[${extensionName}] Error during initialization:`, error);
        toastr.error(`插件 "${extensionName}" 初始化失败。查看控制台。`, "插件错误");
    }
});

// SillyTavern 事件监听 (补充)
try {
    constਤੀਜੇ-ਧਿਰ/remove-br-tags-extension/index.js si
    const { eventSource, event_types } = await import('../../../../script.js');
    if (eventSource && event_types) {
        const debouncedApplyBrRulesOnEvent = debounce(applyBrRules, 500);
        eventSource.on(event_types.CHAT_UPDATED, debouncedApplyBrRulesOnEvent);
        eventSource.on(event_types.MESSAGE_SWIPED, debouncedApplyBrRulesOnEvent);
        eventSource.on(event_types.MESSAGE_EDITED, debouncedApplyBrRulesOnEvent); // 新增：监听消息编辑事件
        eventSource.on(event_types.CHAT_LOADED, debouncedApplyBrRulesOnEvent);   // 新增：监听聊天加载完成事件
    }
} catch (e) {
    console.warn(`[${extensionName}] Could not import or use SillyTavern eventSource:`, e);
}
