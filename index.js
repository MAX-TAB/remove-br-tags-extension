// remove-br-tags-extension/index.js

// 插件名称，也用作localStorage的键前缀
const extensionName = "remove-br-tags-extension";
const extensionFolderPath = `scripts/extensions/third-party/${extensionName}`;

// localStorage中存储设置的键名
const LOCAL_STORAGE_KEY = `st-ext-${extensionName}-settings`;

// 插件的默认设置
const defaultSettings = {
    hideBrInChat: false,
    hideBrGlobal: false,
};

// 用于动态添加/移除CSS规则的 <style> 标签的ID
const STYLE_TAG_ID = "br-visibility-dynamic-styles";

/**
 * 从localStorage加载插件设置。
 * @returns {object} 插件的当前设置
 */
function loadSettingsFromLocalStorage() {
    try {
        const storedSettings = localStorage.getItem(LOCAL_STORAGE_KEY);
        if (storedSettings) {
            const parsedSettings = JSON.parse(storedSettings);
            // 合并已存储设置和默认设置，以确保所有键都存在 (例如插件更新后新增了默认键)
            return { ...defaultSettings, ...parsedSettings };
        }
    } catch (error) {
        console.error(`[${extensionName}] Error loading settings from localStorage:`, error);
        // 如果解析失败，返回默认设置
    }
    return { ...defaultSettings }; // 返回默认设置的副本
}

/**
 * 将插件设置保存到localStorage。
 * @param {object} settings 要保存的设置对象
 */
function saveSettingsToLocalStorage(settings) {
    try {
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(settings));
        // console.log(`[${extensionName}] Settings saved to localStorage:`, settings);
    } catch (error) {
        console.error(`[${extensionName}] Error saving settings to localStorage:`, error);
        toastr.error(`无法保存插件 ${extensionName} 的设置到LocalStorage。`, "存储错误");
    }
}

// 当前插件设置的内存副本
let currentSettings = loadSettingsFromLocalStorage();

/**
 * 应用当前的 <br> 标签显示/隐藏设置
 */
function applyBrVisibility() {
    // 使用 currentSettings
    let cssRules = "";
    if (currentSettings.hideBrInChat) {
        cssRules += `
            .mes_text br, .mes .force-user-msg br, .mes .force-char-msg br,
            div[class*="chat"] div[id^="chatMessage"] br, .message-content br {
                display: none !important;
            }
        `;
    } else {
        cssRules += `
            .mes_text br, .mes .force-user-msg br, .mes .force-char-msg br,
            div[class*="chat"] div[id^="chatMessage"] br, .message-content br {
                display: revert !important;
            }
        `;
    }

    if (currentSettings.hideBrGlobal) {
        cssRules += `body br { display: none !important; }`;
    } else {
        cssRules += `body br { display: revert !important; }`;
    }

    let styleTag = document.getElementById(STYLE_TAG_ID);
    if (!styleTag) {
        styleTag = document.createElement('style');
        styleTag.id = STYLE_TAG_ID;
        styleTag.type = 'text/css';
        document.head.appendChild(styleTag);
    }
    styleTag.textContent = cssRules;
}

/**
 * 当 "隐藏聊天消息中的 <br>" 复选框状态改变时调用
 * @param {Event} event - 输入事件对象
 */
function onChatBrToggle(event) {
    currentSettings.hideBrInChat = Boolean(event.target.checked);
    saveSettingsToLocalStorage(currentSettings);
    applyBrVisibility();
}

/**
 * 当 "隐藏整个界面中的 <br>" 复选框状态改变时调用
 * @param {Event} event - 输入事件对象
 */
function onGlobalBrToggle(event) {
    currentSettings.hideBrGlobal = Boolean(event.target.checked);
    saveSettingsToLocalStorage(currentSettings);
    applyBrVisibility();

    if (currentSettings.hideBrGlobal) {
        toastr.warning(
            "全局隐藏 <br> 标签已启用。如果界面显示异常，请禁用此选项。",
            "BR标签控制警告",
            { timeOut: 7000, preventDuplicates: true }
        );
    }
}

/**
 * 初始化UI元素的状态以匹配加载的设置
 */
function updateUIFromSettings() {
    const chatCheckbox = document.getElementById('st-br-control-chat');
    if (chatCheckbox) {
        chatCheckbox.checked = currentSettings.hideBrInChat;
    }

    const globalCheckbox = document.getElementById('st-br-control-global');
    if (globalCheckbox) {
        globalCheckbox.checked = currentSettings.hideBrGlobal;
    }

    console.log(`[${extensionName}] UI updated from settings. Chat BR: ${currentSettings.hideBrInChat}, Global BR: ${currentSettings.hideBrGlobal}`);
}

// 当SillyTavern加载此插件时执行
jQuery(async () => {
    try {
        const settingsHtmlPath = `${extensionFolderPath}/settings.html`;
        const settingsHtml = await $.get(settingsHtmlPath);
        $("#extensions_settings").append(settingsHtml);

        $(document).on('input', '#st-br-control-chat', onChatBrToggle);
        $(document).on('input', '#st-br-control-global', onGlobalBrToggle);

        // 从localStorage加载设置 (已经由 currentSettings 初始化时完成)
        // 更新UI并应用CSS
        updateUIFromSettings();
        applyBrVisibility();

        console.log(`[${extensionName}] Extension (using direct localStorage) initialized successfully.`);

    } catch (error) {
        console.error(`[${extensionName}] Error during initialization (direct localStorage):`, error);
        toastr.error(
            `插件 "${extensionName}" 初始化失败。详情请查看浏览器控制台。`,
            "插件错误",
            { timeOut: 10000 }
        );
    }
});
