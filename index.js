// remove-br-tags-extension/index.js

const extensionName = "remove-br-tags-extension";
const extensionFolderPath = `scripts/extensions/third-party/${extensionName}`;
const LOCAL_STORAGE_KEY = `st-ext-${extensionName}-settings-v2`; // v2 用于区分旧设置

const defaultSettings = {
    // 聊天消息相关
    chatHideAllBr: false,
    chatHideLeadingBr: true,
    chatMergeConsecutiveBr: true,
    chatSmartExternalBr: false,

    // 全局相关
    globalHideAllBr: false,
};

const ORIGINAL_DISPLAY_ATTR = 'data-original-display';
const PROCESSED_BY_PLUGIN_ATTR = 'data-br-processed';
const HIDDEN_BY_RULE_ATTR = 'data-br-hidden-by';

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
        br.style.display = originalDisplay || '';
        br.removeAttribute(ORIGINAL_DISPLAY_ATTR);
        br.removeAttribute(PROCESSED_BY_PLUGIN_ATTR);
        br.removeAttribute(HIDDEN_BY_RULE_ATTR);
    });
}

function markBrAsHidden(brElement, ruleName) {
    if (!brElement || typeof brElement.hasAttribute !== 'function') return; // 安全检查

    if (!brElement.hasAttribute(PROCESSED_BY_PLUGIN_ATTR)) {
        const currentDisplay = window.getComputedStyle(brElement).display;
        if (currentDisplay !== 'none') {
            brElement.setAttribute(ORIGINAL_DISPLAY_ATTR, currentDisplay);
        }
        brElement.style.display = 'none';
        brElement.setAttribute(PROCESSED_BY_PLUGIN_ATTR, 'true');
        brElement.setAttribute(HIDDEN_BY_RULE_ATTR, ruleName);
    } else if (brElement.style.display !== 'none') {
        brElement.style.display = 'none';
        brElement.setAttribute(HIDDEN_BY_RULE_ATTR, ruleName); // 更新隐藏规则
    }
}

function markBrAsVisible(brElement, ruleName) {
    if (!brElement || typeof brElement.hasAttribute !== 'function') return; // 安全检查

    if (brElement.hasAttribute(PROCESSED_BY_PLUGIN_ATTR) && brElement.style.display === 'none') {
        const originalDisplay = brElement.getAttribute(ORIGINAL_DISPLAY_ATTR);
        brElement.style.display = originalDisplay || '';
        brElement.setAttribute(HIDDEN_BY_RULE_ATTR, `exempted_by_${ruleName}`);
    } else if (!brElement.hasAttribute(PROCESSED_BY_PLUGIN_ATTR)) {
        brElement.setAttribute(PROCESSED_BY_PLUGIN_ATTR, 'true'); // 标记为已处理
        brElement.setAttribute(HIDDEN_BY_RULE_ATTR, `kept_by_${ruleName}`);
    }
}

function applyBrRules() {
    console.time(`[${extensionName}] applyBrRules`);
    revertAllBrModifications();
    const settings = currentSettings;

    if (settings.globalHideAllBr) {
        document.querySelectorAll('body br').forEach(br => markBrAsHidden(br, 'globalHideAllBr'));
        console.timeEnd(`[${extensionName}] applyBrRules`);
        // console.log(`[${extensionName}] Applied: globalHideAllBr`);
        return;
    }

    const chatMessageSelectors = [
        '.mes_text',
        '.mes .force-user-msg .mes_text',
        '.mes .force-char-msg .mes_text',
        'div[id^="chatMessage"] .mes_text',
        '.message-content',
    ];

    document.querySelectorAll(chatMessageSelectors.join(', ')).forEach(chatContainer => {
        if (settings.chatHideAllBr) {
            chatContainer.querySelectorAll('br').forEach(br => markBrAsHidden(br, 'chatHideAllBr'));
            // console.log(`[${extensionName}] Applied to container: chatHideAllBr`);
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
                let isSequence = false;
                while (nextSignificantNode) {
                    if (nextSignificantNode.nodeType === Node.TEXT_NODE && nextSignificantNode.textContent.trim() === '') {
                        nextSignificantNode = nextSignificantNode.nextSibling;
                        continue;
                    }
                    if (nextSignificantNode.nodeName === 'BR') {
                        isSequence = true;
                        markBrAsHidden(nextSignificantNode, 'chatMergeConsecutiveBr');
                        nextSignificantNode = nextSignificantNode.nextSibling;
                    } else {
                        break;
                    }
                }
                // if (isSequence) console.log(`[${extensionName}] Merged BRs after`, currentBr);
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
                        const hiddenByThisRulePreviously = br.getAttribute(HIDDEN_BY_RULE_ATTR) === 'chatSmartExternalBr_hide_naked';
                        // 只有当它不是被自己这个规则的隐藏部分隐藏时，才豁免。避免循环。
                        // 或者，如果它被 leading 或 merge 隐藏，smart 规则现在豁免它。
                        const hiddenByOtherChatRule = br.getAttribute(HIDDEN_BY_RULE_ATTR) === 'chatHideLeadingBr' || br.getAttribute(HIDDEN_BY_RULE_ATTR) === 'chatMergeConsecutiveBr';
                        if (!hiddenByThisRulePreviously || hiddenByOtherChatRule) {
                           markBrAsVisible(br, 'chatSmartExternalBr_exempt');
                        }
                    } else if (br.style.display !== 'none' && !br.hasAttribute(PROCESSED_BY_PLUGIN_ATTR)) {
                        markBrAsVisible(br, 'chatSmartExternalBr_kept');
                    }
                } else { // Naked BR
                    if (br.style.display !== 'none') {
                         // 只有当它没有被其他规则明确豁免或保留时才隐藏
                        const keptOrExempted = br.hasAttribute(HIDDEN_BY_RULE_ATTR) && (br.getAttribute(HIDDEN_BY_RULE_ATTR).includes('exempt') || br.getAttribute(HIDDEN_BY_RULE_ATTR).includes('kept'));
                        if (!keptOrExempted) {
                            markBrAsHidden(br, 'chatSmartExternalBr_hide_naked');
                        }
                    }
                }
            });
        }
    });
    console.timeEnd(`[${extensionName}] applyBrRules`);
    // console.log(`[${extensionName}] Finished applying rules.`);
}


function updateUIFromSettings() {
    const s = currentSettings;
    // jQuery is loaded at this point, $ should be available
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
        case 'st-br-chat-hide-all': currentSettings.chatHideAllBr = checked; break;
        case 'st-br-chat-hide-leading': currentSettings.chatHideLeadingBr = checked; break;
        case 'st-br-chat-merge-consecutive': currentSettings.chatMergeConsecutiveBr = checked; break;
        case 'st-br-chat-smart-external':
            currentSettings.chatSmartExternalBr = checked;
            if (checked && typeof toastr !== 'undefined') {
                toastr.info("“智能保留”规则是实验性的。", "实验性功能", { timeOut: 5000 });
            }
            break;
        case 'st-br-global-hide-all':
            currentSettings.globalHideAllBr = checked;
            if (checked && typeof toastr !== 'undefined') {
                toastr.warning("全局隐藏 <br> 已启用。", "BR标签控制警告", { timeOut: 7000, preventDuplicates: true });
            }
            break;
        default:
            // console.warn(`[${extensionName}] Unknown setting ID changed: ${targetId}`);
            return;
    }

    saveSettingsToLocalStorage(currentSettings);
    applyBrRules();
}

let chatObserver = null;
function observeChatMessages() {
    const debouncedApplyBrRules = debounce(applyBrRules, 300);

    // Try multiple selectors for the chat area, prioritizing more specific ones
    const chatAreaSelectors = ['#chat', '.chat-messages-container', '#chat-scroll-container', 'div[class*="chatlog"]', 'body'];
    let mainChatArea = null;
    for (const selector of chatAreaSelectors) {
        mainChatArea = document.querySelector(selector);
        if (mainChatArea) break;
    }

    if (!mainChatArea) {
        console.warn(`[${extensionName}] Could not find a suitable chat area to observe. Falling back to body, which might be inefficient.`);
        mainChatArea = document.body;
    }
    // console.log(`[${extensionName}] MutationObserver targeting:`, mainChatArea);


    if (chatObserver) {
        chatObserver.disconnect();
    }

    chatObserver = new MutationObserver((mutationsList) => {
        let relevantMutation = false;
        for (const mutation of mutationsList) {
            if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
                for (const node of mutation.addedNodes) {
                    if (node.nodeType === Node.ELEMENT_NODE) {
                        if (node.matches && (node.matches('.mes') || node.querySelector('.mes_text') || node.classList.contains('message'))) {
                            relevantMutation = true;
                            break;
                        }
                    }
                }
            }
            if (relevantMutation) break;
        }

        if (relevantMutation) {
            // console.log(`[${extensionName}] Chat content changed, re-applying BR rules (debounced).`);
            debouncedApplyBrRules();
        }
    });

    chatObserver.observe(mainChatArea, { childList: true, subtree: true });
    // console.log(`[${extensionName}] MutationObserver started.`);
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

// Import SillyTavern event system if available for more robust updates
let eventSource, event_types;
try {
    // Dynamic import attempt, might fail if paths change or in very old ST versions
    import('../../../../script.js').then(module => {
        eventSource = module.eventSource;
        event_types = module.event_types;

        if (eventSource && event_types) {
            const debouncedApplyBrRulesOnEvent = debounce(applyBrRules, 400);
            eventSource.on(event_types.CHAT_UPDATED, debouncedApplyBrRulesOnEvent);
            eventSource.on(event_types.MESSAGE_SWIPED, debouncedApplyBrRulesOnEvent);
            // console.log(`[${extensionName}] SillyTavern event listeners attached.`);
        }
    }).catch(err => {
        // console.warn(`[${extensionName}] Could not import eventSource/event_types from SillyTavern script.js:`, err.message);
    });
} catch (e) {
    // console.warn(`[${extensionName}] Error during dynamic import for SillyTavern events:`, e.message);
}


// jQuery ready function for initialization
jQuery(async () => {
    try {
        const settingsHtmlPath = `${extensionFolderPath}/settings.html`;
        // console.log(`[${extensionName}] Fetching settings HTML from: ${settingsHtmlPath}`);
        const settingsHtml = await $.get(settingsHtmlPath);
        // console.log(`[${extensionName}] Settings HTML fetched.`);

        // Try to append to a standard SillyTavern settings container
        const $extensionsSettings = $("#extensions_settings");
        if ($extensionsSettings.length) {
            $extensionsSettings.append(settingsHtml);
            // console.log(`[${extensionName}] Settings HTML appended to #extensions_settings.`);
        } else {
            // Fallback if the primary container isn't found (e.g., older ST or different DOM)
            // This is less ideal as it might place the settings in an unexpected location.
            // $('body').append(settingsHtml); // Last resort, likely to look bad.
            console.warn(`[${extensionName}] #extensions_settings container not found. Settings panel might not display correctly.`);
        }

        // Use event delegation from a static parent if settingsHtml is appended dynamically
        $(document).on('input', `#${extensionName}-settings-container input[type="checkbox"], .br-tags-control-settings input[type="checkbox"]`, onSettingsChange);
        $(document).on('click', `#st-br-apply-rules-now`, () => {
            if (typeof toastr !== 'undefined') toastr.info("手动应用BR规则...", extensionName, { timeOut: 1000 });
            applyBrRules();
        });
        // For the settings.html structure:
        // Add an ID to the main div in settings.html for more robust event delegation:
        // e.g., <div id="remove-br-tags-extension-settings-container" class="br-tags-control-settings">
        // Then use: $(document).on('input', '#remove-br-tags-extension-settings-container input[type="checkbox"]', onSettingsChange);

        currentSettings = loadSettingsFromLocalStorage();
        updateUIFromSettings(); // Update checkboxes based on loaded settings
        applyBrRules();         // Apply rules on initial load

        observeChatMessages();

        console.log(`[${extensionName}] Extension initialized successfully.`);

    } catch (error) {
        console.error(`[${extensionName}] Critical error during initialization:`, error);
        if (typeof toastr !== 'undefined') {
            toastr.error(`插件 "${extensionName}" 初始化失败。详情请查看浏览器控制台。`, "插件错误", { timeOut: 0 }); // 0 for persistent
        }
        // If the panel itself fails to load, the user might not even see this toast.
        // A console error is the most reliable feedback in this case.
        alert(`插件 "${extensionName}" 初始化时发生严重错误，可能无法正常工作。请检查浏览器控制台 (F12) 获取详细信息。`);
    }
});
