// SillyTavern/public/scripts/extensions/third-party/remove-br-tags-extension/index.js
'use strict';

// 从扩展助手脚本导入 (路径相对于当前文件)
import {
    extension_settings,
    // getContext, // 范例中没有在顶层使用 getContext 来获取设置，而是直接用 extension_settings
    // loadExtensionSettings, // 范例中是自己写的 loadSettings 函数
} from '../../extensions.js'; // 向上两级到 public/scripts/extensions/extensions.js

// 从主脚本导入 (路径相对于当前文件)
import { saveSettingsDebounced } from '../../../script.js'; // 向上三级到 public/scripts/script.js

// 插件名称 (与文件夹名一致)
const extensionName = 'remove-br-tags-extension';
// 插件文件夹路径 (相对于 SillyTavern 的 public 目录)
const extensionFolderPath = `scripts/extensions/third-party/${extensionName}`;

// 默认设置
const defaultSettings = {
    hideChatBr: false,
    hideAllBr: false,
};

// CSS 类名
const CSS_CLASS_HIDE_CHAT_BR = 'ext-hide-chat-br-tags';
const CSS_CLASS_HIDE_ALL_BR = 'ext-hide-all-br-tags';


// 加载或初始化插件设置
// (这个函数名和逻辑模仿官方范例的 loadSettings)
function loadPluginSettings() {
    // 如果此插件的设置对象在全局 extension_settings 中不存在，则创建它
    if (!extension_settings[extensionName]) {
        console.log(`[${extensionName}] Settings not found, creating with defaults.`);
        extension_settings[extensionName] = {};
    }

    // 如果设置对象是空的 (例如首次加载)，则用默认值填充
    // 或者，更稳妥的是，确保所有默认键都存在
    let settingsChanged = false;
    for (const key in defaultSettings) {
        if (typeof extension_settings[extensionName][key] === 'undefined') {
            extension_settings[extensionName][key] = defaultSettings[key];
            settingsChanged = true;
        }
    }
    if(settingsChanged){
        console.log(`[${extensionName}] Initialized some default settings.`);
        // 如果有设置被初始化为默认值，可以考虑保存一次，但通常由用户首次交互触发保存
        // saveSettingsDebounced(); // 首次加载时通常不需要主动保存，除非有强制的初始值
    }


    // 获取当前设置，用于更新UI (如果UI已加载)
    const currentSettings = extension_settings[extensionName];

    // 更新UI复选框的状态
    // 确保这些ID与 settings_display.html 中的ID一致
    const $chatToggle = $("#br_ext_hide_chat_br_toggle");
    const $allToggle = $("#br_ext_hide_all_br_toggle");

    if ($chatToggle.length) {
        $chatToggle.prop("checked", currentSettings.hideChatBr);
    }
    if ($allToggle.length) {
        $allToggle.prop("checked", currentSettings.hideAllBr);
    }
    // 官方范例中有一个 .trigger("input")，如果你的复选框有其他监听 input 事件的逻辑，可以加上
    // 但对于简单的状态设置，通常不需要。

    // 初始应用样式
    applyBrVisibilityStyle();
}

// 当“隐藏聊天BR”复选框状态改变时调用
function onChatBrToggleChange(event) {
    const value = Boolean($(event.target).prop("checked"));
    extension_settings[extensionName].hideChatBr = value;
    saveSettingsDebounced(); // 保存设置
    applyBrVisibilityStyle(); // 立即应用样式
    // console.log(`[${extensionName}] hideChatBr set to: ${value}`);
}

// 当“隐藏所有BR”复选框状态改变时调用
function onAllBrToggleChange(event) {
    const value = Boolean($(event.target).prop("checked"));
    extension_settings[extensionName].hideAllBr = value;
    saveSettingsDebounced(); // 保存设置
    applyBrVisibilityStyle(); // 立即应用样式
    // console.log(`[${extensionName}] hideAllBr set to: ${value}`);
}

// 应用BR显隐的CSS样式
function applyBrVisibilityStyle() {
    const settings = extension_settings[extensionName] || defaultSettings; // 获取当前设置或默认值
    const $body = $('body');

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


// 插件主入口 (DOM ready后执行)
jQuery(async ($) => { // 传入 jQuery 作为 $
    console.log(`[${extensionName}] Document ready. Loading extension HTML and attaching events.`);

    try {
        // 异步加载 settings_display.html 文件内容
        // 路径是相对于 SillyTavern 的 public 目录
        const settingsHtmlPath = `${extensionFolderPath}/settings_display.html`;
        console.log(`[${extensionName}] Attempting to load HTML from: ${settingsHtmlPath}`);
        const settingsHtmlString = await $.get(settingsHtmlPath);

        if (settingsHtmlString && typeof settingsHtmlString === 'string') {
            const $settingsContainer = $('#extensions_settings'); // SillyTavern 中扩展设置的总容器
            if ($settingsContainer.length) {
                // 为本插件创建一个唯一的包装器，避免ID冲突，方便管理
                const $pluginSettingsWrapper = $(`<div id="${extensionName}-settings-wrapper" class="extension-settings-tab-content"></div>`);
                $pluginSettingsWrapper.html(settingsHtmlString);
                $settingsContainer.append($pluginSettingsWrapper);
                console.log(`[${extensionName}] Settings UI injected into #extensions_settings.`);

                // HTML注入后，为其中的元素绑定事件处理器
                // 确保ID与 settings_display.html 中的ID一致
                $("#br_ext_hide_chat_br_toggle").on("change", onChatBrToggleChange); // 用 "change" 事件更适合复选框
                $("#br_ext_hide_all_br_toggle").on("change", onAllBrToggleChange);

                // 加载初始设置到UI并应用样式
                loadPluginSettings();

            } else {
                console.error(`[${extensionName}] Target container #extensions_settings not found.`);
            }
        } else {
            console.error(`[${extensionName}] Loaded HTML from ${settingsHtmlPath} is empty or not a string.`);
        }
    } catch (error) {
        console.error(`[${extensionName}] Failed to load or inject settings_display.html:`, error);
        // 可以在 #extensions_settings 中显示一个错误信息
        $('#extensions_settings').append(`<div style="color:red; padding:10px;">Error loading settings for ${extensionName}: ${error.message || 'Unknown error'}. Check console and network tab.</div>`);
    }

    // 监听SillyTavern全局设置更新事件 (如果其他地方修改了设置，也需要同步)
    eventSource.on(event_types.SETTINGS_UPDATED, function() {
        // console.log(`[${extensionName}] Global SETTINGS_UPDATED event received.`);
        // 重新加载设置到UI并应用样式，以防万一其他方式修改了此插件的设置
        loadPluginSettings();
    });

    // 初始应用一次样式 (以防UI加载前就需要)
    // loadPluginSettings() 内部会调用 applyBrVisibilityStyle()，所以这里可能重复，但无害
    applyBrVisibilityStyle();

    console.log(`[${extensionName}] Plugin initialized.`);
});
