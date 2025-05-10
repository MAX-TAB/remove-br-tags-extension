// remove-br-tags-extension/index.js

// 导入SillyTavern的必要模块
import { extension_settings, getContext, loadExtensionSettings } from "../../../extensions.js";
import { saveSettingsDebounced } from "../../../../script.js";

// 插件名称，应与文件夹名称一致，用于设置存储
const extensionName = "remove-br-tags-extension";
const extensionFolderPath = `scripts/extensions/third-party/${extensionName}`;

// 日志前缀，方便在控制台区分
const EXTENSION_LOG_PREFIX = `[${extensionName}]`;

// 插件的默认设置
const defaultSettings = {
    hideBrInChat: false,
    hideBrGlobal: false,
};

// 用于动态添加/移除CSS规则的 <style> 标签的ID
const STYLE_TAG_ID = "br-visibility-dynamic-styles";

/**
 * 获取或初始化插件设置
 * @returns {object} 插件的当前设置
 */
function getPluginSettings() {
    // 如果设置对象不存在，则初始化
    if (!extension_settings[extensionName]) {
        console.log(EXTENSION_LOG_PREFIX, "Initializing settings for the first time or if previously cleared.");
        extension_settings[extensionName] = { ...defaultSettings }; // 使用扩展运算符创建副本
    }
    // 确保所有默认键都存在 (用于插件更新后添加新设置项)
    for (const key in defaultSettings) {
        if (extension_settings[extensionName][key] === undefined) {
            console.log(EXTENSION_LOG_PREFIX, `Adding missing default key: '${key}' with value:`, defaultSettings[key]);
            extension_settings[extensionName][key] = defaultSettings[key];
        }
    }
    return extension_settings[extensionName];
}

/**
 * 应用当前的 <br> 标签显示/隐藏设置
 */
function applyBrVisibility() {
    const settings = getPluginSettings();
    let cssRules = "";

    // 规则1: 控制聊天消息中的 <br>
    if (settings.hideBrInChat) {
        cssRules += `
            .mes_text br {
                display: none !important;
            }
        `;
    } else {
        cssRules += `
            .mes_text br {
                display: revert !important; /* 恢复到其继承或初始的display值 */
            }
        `;
    }

    // 规则2: 控制全局的 <br>
    if (settings.hideBrGlobal) {
        cssRules += `
            body br { /* 注意：这可能影响整个UI，需谨慎 */
                display: none !important;
            }
        `;
    } else {
         cssRules += `
            body br {
                display: revert !important;
            }
        `;
    }

    let styleTag = document.getElementById(STYLE_TAG_ID);
    if (!styleTag) {
        styleTag = document.createElement('style');
        styleTag.id = STYLE_TAG_ID;
        styleTag.type = 'text/css';
        document.head.appendChild(styleTag);
        // console.log(EXTENSION_LOG_PREFIX, "Created new style tag for BR visibility.");
    }

    if (styleTag.textContent !== cssRules) { // 只有当规则改变时才更新，减少不必要的DOM操作
        styleTag.textContent = cssRules;
        // console.log(EXTENSION_LOG_PREFIX, "Applied BR visibility CSS rules:", settings);
    }
}


/**
 * 当 "隐藏聊天消息中的 <br>" 复选框状态改变时调用
 * @param {Event} event - 输入事件对象
 */
function onChatBrToggle(event) {
    const settings = getPluginSettings();
    const newValue = Boolean(event.target.checked);
    if (settings.hideBrInChat !== newValue) {
        settings.hideBrInChat = newValue;
        console.log(EXTENSION_LOG_PREFIX, "Chat BR setting changed to:", settings.hideBrInChat, "Current full settings:", JSON.parse(JSON.stringify(extension_settings[extensionName])));
        saveSettingsDebounced();
        console.log(EXTENSION_LOG_PREFIX, "saveSettingsDebounced() called for Chat BR toggle.");
        applyBrVisibility();
    }
}

/**
 * 当 "隐藏整个界面中的 <br>" 复选框状态改变时调用
 * @param {Event} event - 输入事件对象
 */
function onGlobalBrToggle(event) {
    const settings = getPluginSettings();
    const newValue = Boolean(event.target.checked);
    if (settings.hideBrGlobal !== newValue) {
        settings.hideBrGlobal = newValue;
        console.log(EXTENSION_LOG_PREFIX, "Global BR setting changed to:", settings.hideBrGlobal, "Current full settings:", JSON.parse(JSON.stringify(extension_settings[extensionName])));
        saveSettingsDebounced();
        console.log(EXTENSION_LOG_PREFIX, "saveSettingsDebounced() called for Global BR toggle.");
        applyBrVisibility();

        if (settings.hideBrGlobal) {
            toastr.warning(
                "全局隐藏 <br> 标签已启用。如果界面显示异常，请禁用此选项。",
                "BR标签控制警告",
                { timeOut: 7000, positionClass: 'toast-bottom-right' } // 显示在右下角
            );
        }
    }
}

/**
 * 加载插件设置并更新UI元素的状态
 */
async function loadSettings() {
    console.log(EXTENSION_LOG_PREFIX, "Attempting to load settings. Current state of extension_settings['"+extensionName+"'] before load:", JSON.parse(JSON.stringify(extension_settings[extensionName] || null)));
    await loadExtensionSettings(extensionName, defaultSettings); // SillyTavern的加载函数
    // loadExtensionSettings 会修改全局的 extension_settings[extensionName]
    console.log(EXTENSION_LOG_PREFIX, "Settings after loadExtensionSettings for extension_settings['"+extensionName+"']:", JSON.parse(JSON.stringify(extension_settings[extensionName])));

    const settings = getPluginSettings(); // 确保所有键存在，并获取最终的设置对象
    console.log(EXTENSION_LOG_PREFIX, "Final settings object after getPluginSettings:", JSON.parse(JSON.stringify(settings)));

    // 更新复选框的状态
    const chatCheckbox = document.getElementById('st-br-control-chat');
    if (chatCheckbox) {
        chatCheckbox.checked = settings.hideBrInChat;
    } else {
        console.warn(EXTENSION_LOG_PREFIX, "Chat checkbox ('st-br-control-chat') not found during loadSettings.");
    }

    const globalCheckbox = document.getElementById('st-br-control-global');
    if (globalCheckbox) {
        globalCheckbox.checked = settings.hideBrGlobal;
    } else {
        console.warn(EXTENSION_LOG_PREFIX, "Global checkbox ('st-br-control-global') not found during loadSettings.");
    }

    applyBrVisibility(); // 根据加载的设置应用CSS
    console.log(EXTENSION_LOG_PREFIX, "Settings loaded and UI updated. Chat BR hidden:", settings.hideBrInChat, "Global BR hidden:", settings.hideBrGlobal);
}

// 当SillyTavern加载此插件时执行
jQuery(async () => {
    console.log(EXTENSION_LOG_PREFIX, "Extension initializing...");
    try {
        const settingsHtml = await $.get(`${extensionFolderPath}/settings.html`);
        $("#extensions_settings").append(settingsHtml);
        console.log(EXTENSION_LOG_PREFIX, "Settings HTML loaded and appended.");

        // 绑定事件监听器到复选框
        // 使用事件委托确保元素加载后绑定成功
        $("#extensions_settings").on('input', '#st-br-control-chat', onChatBrToggle);
        $("#extensions_settings").on('input', '#st-br-control-global', onGlobalBrToggle);
        console.log(EXTENSION_LOG_PREFIX, "Event listeners bound.");

        // 加载并应用初始设置
        await loadSettings();
        console.log(EXTENSION_LOG_PREFIX, "Extension loaded successfully.");

    } catch (error) {
        console.error(EXTENSION_LOG_PREFIX, "Error during extension initialization:", error);
    }
});
