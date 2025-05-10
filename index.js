// SillyTavern/public/scripts/extensions/third-party/remove-br-tags-extension/index.js
'use strict';

// 从核心脚本导入 (路径相对于 public/scripts/extensions/third-party/remove-br-tags-extension/index.js)
import {
    eventSource,
    event_types,
    // messageFormatting, // 不需要
    // chat, // 不需要
} from '../../../script.js'; // 向上三级到 public/scripts/script.js

// 从扩展助手脚本导入 (路径相对于当前文件)
import {
    // getContext, // 如果确实需要 context 的其他部分
    renderExtensionTemplateAsync,
    extension_settings, // SillyTavern 用于存储所有扩展设置的对象
    // saveMetadataDebounced // settings_display.html 中的脚本会通过 SillyTavern.saveSettingsDebounced 调用
} from '../../extensions.js'; // 向上两级到 public/scripts/extensions/extensions.js

// 定义插件文件夹名称 (必须与实际文件夹名称完全一致)
const pluginName = 'remove-br-tags-extension';

// 初始化此插件的设置对象 (如果尚不存在)
// jQuery(async () => {}) 内部也会做一次检查和初始化
if (typeof extension_settings !== 'undefined' && !extension_settings[pluginName]) {
    extension_settings[pluginName] = {
        hideChatBr: false,
        hideAllBr: false,
    };
}

// 使用jQuery的DOM ready事件作为主入口点
jQuery(async ($) => { // 传入 jQuery 作为 $
    console.log(`[${pluginName}] Initializing plugin... (DOM ready)`);

    // --- 插件核心逻辑变量 ---
    const CSS_CLASS_HIDE_CHAT_BR = 'ext-hide-chat-br-tags';
    const CSS_CLASS_HIDE_ALL_BR = 'ext-hide-all-br-tags';

    // --- getPluginSettings: 从共享的 extension_settings 对象中获取本插件的设置 ---
    function getPluginSettings() {
        // 确保 extension_settings 已被正确导入并可用
        if (typeof extension_settings === 'undefined') {
            console.error(`[${pluginName}] extension_settings is undefined. Cannot get settings.`);
            return { hideChatBr: false, hideAllBr: false }; // 返回默认以避免崩溃
        }
        const defaultSettings = {
            hideChatBr: false,
            hideAllBr: false,
        };
        if (!extension_settings[pluginName]) {
            console.log(`[${pluginName}] Initializing settings for ${pluginName} in extension_settings.`);
            extension_settings[pluginName] = { ...defaultSettings };
        } else {
            for (const key in defaultSettings) {
                if (typeof extension_settings[pluginName][key] === 'undefined') {
                    extension_settings[pluginName][key] = defaultSettings[key];
                }
            }
        }
        return extension_settings[pluginName];
    }

    // --- applyBrVisibilityStyle: 根据设置切换body上的CSS类 ---
    function applyBrVisibilityStyle() {
        const settings = getPluginSettings();
        const $body = $('body'); // 缓存jQuery对象

        if (settings.hideAllBr) {
            $body.addClass(CSS_CLASS_HIDE_ALL_BR).removeClass(CSS_CLASS_HIDE_CHAT_BR);
        } else {
            $body.removeClass(CSS_CLASS_HIDE_ALL_BR);
            if (settings.hideChatBr) {
                $body.addClass(CSS_CLASS_HIDE_CHAT_BR);
            } else {
                $body.removeClass(CSS_CLASS_HIDE_CHAT_BR);
            }
        }
    }

    // --- 将 applyBrVisibilityStyle 函数暴露给 settings_display.html ---
    if (!window.extensions) {
        window.extensions = {};
    }
    if (!window.extensions[pluginName]) {
        window.extensions[pluginName] = {};
    }
    window.extensions[pluginName].applyVisibility = function (currentSettings) {
        const $body = $('body');
        if (currentSettings.hideAllBr) {
            $body.addClass(CSS_CLASS_HIDE_ALL_BR).removeClass(CSS_CLASS_HIDE_CHAT_BR);
        } else {
            $body.removeClass(CSS_CLASS_HIDE_ALL_BR);
            if (currentSettings.hideChatBr) {
                $body.addClass(CSS_CLASS_HIDE_CHAT_BR);
            } else {
                $body.removeClass(CSS_CLASS_HIDE_CHAT_BR);
            }
        }
    };

    // --- 加载并注入 settings_display.html ---
    try {
        if (typeof renderExtensionTemplateAsync !== 'function') {
            console.error(`[${pluginName}] renderExtensionTemplateAsync is not available (type: ${typeof renderExtensionTemplateAsync}). Cannot load settings UI.`);
            throw new Error('renderExtensionTemplateAsync not available');
        }

        console.log(`[${pluginName}] Attempting to load settings UI template 'settings_display' for 'third-party/${pluginName}'...`);
        const settingsHtmlString = await renderExtensionTemplateAsync(`third-party/${pluginName}`, 'settings_display');

        if (settingsHtmlString && typeof settingsHtmlString === 'string') {
            const $settingsContainer = $('#extensions_settings');
            if ($settingsContainer.length) {
                // 移除旧的实例（如果因重复加载等原因存在）
                $settingsContainer.find(`.extension-settings-container[data-extension="${pluginName}"]`).remove();
                // 创建特定于此扩展的包装器
                const $extensionSpecificContainer = $(`<div class="extension-settings-container" data-extension="${pluginName}"></div>`);
                $extensionSpecificContainer.html(settingsHtmlString);
                $settingsContainer.append($extensionSpecificContainer);
                console.log(`[${pluginName}] Settings UI for '${pluginName}' injected into #extensions_settings.`);
            } else {
                console.error(`[${pluginName}] Target container #extensions_settings not found in the DOM.`);
            }
        } else {
            console.error(`[${pluginName}] Loaded settings HTML for 'settings_display' is empty or not a string.`);
        }
    } catch (error) {
        console.error(`[${pluginName}] Failed to load or inject settings_display.html:`, error);
        const $settingsContainer = $('#extensions_settings');
         if ($settingsContainer.length) {
             $settingsContainer.append(`<div style="color: red; padding: 10px; border: 1px solid red;">Error loading settings UI for ${pluginName}: ${error.message || 'Unknown error'}. Check console.</div>`);
         }
    }

    // --- 事件监听 ---
    eventSource.on(event_types.SETTINGS_UPDATED, function () {
        // console.log(`[${pluginName}] Event: SETTINGS_UPDATED received.`);
        applyBrVisibilityStyle(); // 当设置更新时，重新应用样式
    });

    // --- 初始应用 ---
    applyBrVisibilityStyle();

    console.log(`[${pluginName}] BR Tags Visibility plugin initialized and settings UI injection attempted.`);
});
