// SillyTavern/data/your_user_handle/extensions/br-tags-visibility/index.js
'use strict';

import { eventSource, event_types } from '../../../../script.js';

(function () {
    // 初始检查，确保必要的全局对象存在，如果不存在则不立即执行敏感操作
    if (!window.SillyTavern || !window.SillyTavern.getContext) {
        console.warn("BR标签显隐控制: SillyTavern context not available at initial script execution. Operations might be delayed or fail if not properly hooked.");
        // 我们可以什么都不做，依赖SillyTavern后续的调用，或者设置一个延迟/重试
    }

    // 尝试尽早获取context，但要准备好它可能在脚本首次运行时不可用
    let context = null;
    try {
        if (window.SillyTavern && typeof window.SillyTavern.getContext === 'function') {
            context = SillyTavern.getContext();
        }
    } catch (e) {
        console.warn("BR标签显隐控制: Error getting context early:", e);
    }

    const MODULE_NAME = 'brTagsVisibilityExtension';
    const PLUGIN_NAME = 'br-tags-visibility'; // 你的扩展文件夹名
    const CSS_CLASS_HIDE_CHAT_BR = 'ext-hide-chat-br-tags';
    const CSS_CLASS_HIDE_ALL_BR = 'ext-hide-all-br-tags';

    function getSettings() {
        if (!context || !context.extensionSettings) {
            console.error(`${PLUGIN_NAME}: Context or extensionSettings not available for getSettings.`);
            return { hideChatBr: false, hideAllBr: false }; // 返回默认值避免崩溃
        }
        const defaultSettings = {
            hideChatBr: false,
            hideAllBr: false
        };
        if (!context.extensionSettings[MODULE_NAME]) {
            context.extensionSettings[MODULE_NAME] = { ...defaultSettings };
        }
        for (const key in defaultSettings) {
            if (typeof context.extensionSettings[MODULE_NAME][key] === 'undefined') {
                context.extensionSettings[MODULE_NAME][key] = defaultSettings[key];
            }
        }
        return context.extensionSettings[MODULE_NAME];
    }

    function applyBrVisibility() {
        const settings = getSettings();
        if (settings.hideAllBr) {
            document.body.classList.add(CSS_CLASS_HIDE_ALL_BR);
            document.body.classList.remove(CSS_CLASS_HIDE_CHAT_BR);
        } else {
            document.body.classList.remove(CSS_CLASS_HIDE_ALL_BR);
            if (settings.hideChatBr) {
                document.body.classList.add(CSS_CLASS_HIDE_CHAT_BR);
            } else {
                document.body.classList.remove(CSS_CLASS_HIDE_CHAT_BR);
            }
        }
    }

    if (!window.extensions) {
        window.extensions = {};
    }
    if (!window.extensions.brTagsVisibility) {
        window.extensions.brTagsVisibility = {};
    }
    window.extensions.brTagsVisibility.applyVisibility = function(currentSettings) {
        // ... (与之前版本相同)
        if (currentSettings.hideAllBr) {
            document.body.classList.add(CSS_CLASS_HIDE_ALL_BR);
            document.body.classList.remove(CSS_CLASS_HIDE_CHAT_BR);
        } else {
            document.body.classList.remove(CSS_CLASS_HIDE_ALL_BR);
            if (currentSettings.hideChatBr) {
                document.body.classList.add(CSS_CLASS_HIDE_CHAT_BR);
            } else {
                document.body.classList.remove(CSS_CLASS_HIDE_CHAT_BR);
            }
        }
    };

    // 这个函数将是我们加载和注入设置UI的核心逻辑
    // 关键在于何时以及如何调用这个函数
    async function displayExtensionSettings() {
        console.log(`${PLUGIN_NAME}: displayExtensionSettings function called.`);

        // 再次检查SillyTavern和jQuery的可用性，因为此函数可能在稍后被调用
        if (!window.SillyTavern || typeof SillyTavern.renderExtensionTemplateAsync !== 'function') {
            console.error(`${PLUGIN_NAME}: SillyTavern.renderExtensionTemplateAsync is still not available when displayExtensionSettings is called.`);
            // 可以在此向用户显示一个错误信息在预期的设置区域
            const settingsContainer = $('#extensions_settings');
            if (settingsContainer.length) {
                settingsContainer.append(`<div style="color:red;">Error for ${PLUGIN_NAME}: Core function renderExtensionTemplateAsync not found. Cannot load settings.</div>`);
            }
            return;
        }
        if (!window.$) {
            console.error(`${PLUGIN_NAME}: jQuery ($) is not available when displayExtensionSettings is called.`);
            return;
        }

        const settingsContainer = $('#extensions_settings');
        if (!settingsContainer.length) {
            console.error(`${PLUGIN_NAME}: Target container #extensions_settings not found when trying to display settings.`);
            // 这通常意味着SillyTavern的设置面板还没有被打开或创建
            return;
        }

        // 清理该扩展之前可能添加的设置内容，以避免重复
        settingsContainer.find(`.extension-settings-container[data-extension="${PLUGIN_NAME}"]`).remove();


        // 创建一个特定于此扩展的容器，以便更好地管理和清理
        const extensionSpecificContainer = $(`<div class="extension-settings-container" data-extension="${PLUGIN_NAME}"></div>`);


        try {
            console.log(`${PLUGIN_NAME}: Attempting to load settings UI with path 'third-party/${PLUGIN_NAME}' for displayExtensionSettings...`);
            const settingsHtmlString = await SillyTavern.renderExtensionTemplateAsync(`third-party/${PLUGIN_NAME}`, 'settings_display');

            if (settingsHtmlString && typeof settingsHtmlString === 'string') {
                console.log(`${PLUGIN_NAME}: Settings HTML loaded. Appending to its own container within #extensions_settings.`);
                extensionSpecificContainer.html(settingsHtmlString); // 使用 .html() 替换内容，jQuery会处理脚本
                settingsContainer.append(extensionSpecificContainer); // 将特定容器追加到总容器
                console.log(`${PLUGIN_NAME}: Settings UI for ${PLUGIN_NAME} should be injected.`);
            } else {
                console.error(`${PLUGIN_NAME}: Loaded settings HTML is empty or not a string.`);
                extensionSpecificContainer.html(`<p style="color:red;">Failed to load settings content for ${PLUGIN_NAME}.</p>`);
                settingsContainer.append(extensionSpecificContainer);
            }
        } catch (error) {
            console.error(`${PLUGIN_NAME}: Failed to load or inject settings_display.html via displayExtensionSettings:`, error);
            extensionSpecificContainer.html(`<p style="color:red;">Error loading settings for ${PLUGIN_NAME}: ${error.message || error}</p>`);
            settingsContainer.append(extensionSpecificContainer);
        }
    }

    // --- 如何触发 displayExtensionSettings ---
    // 方案1: SillyTavern 提供一个标准的注册方式 (最理想)
    // 例如: context.registerExtensionSettingsRenderer(PLUGIN_NAME, displayExtensionSettings);
    // 或者: SillyTavern.registerExtension({ name: PLUGIN_NAME, onShowSettings: displayExtensionSettings });

    // 方案2: 将函数暴露到全局，期望SillyTavern通过某种方式找到并调用它
    // (不太推荐，但如果这是SillyTavern的模式)
    // window[`onShowSettings_${PLUGIN_NAME}`] = displayExtensionSettings; // 例如
    // SillyTavern.extensions.brTagsVisibility.showSettings = displayExtensionSettings; // 或者挂载到之前创建的命名空间

    // 方案3: 自己监听某个通用事件，比如“设置面板打开”事件 (如果SillyTavern有这样的事件)
    // eventSource.on('extensions_settings_shown', function(data) {
    // if (data.extensionName === PLUGIN_NAME || !data.extensionName) { // 如果是通用事件或针对本扩展
    // displayExtensionSettings();
    // }
    // });

    // 方案4: 作为最后的手段，如果 manifest.json 中的 settings_display_file 应该触发某个动作，
    // 而那个动作只是为了调用一个JS函数来加载内容。
    // 这种情况下，SillyTavern点击设置齿轮时，可能已经创建了 `#extensions_settings`。
    // 如果 SillyTavern 在点击扩展的设置按钮时，会触发一个特定的、可被监听的事件，
    // 或者会调用一个约定好的函数名，那是最好的。

    // **考虑到错误是 "function is not available"，主要问题是时机。**
    // 我们需要延迟 `displayExtensionSettings` 的实际执行，直到 `renderExtensionTemplateAsync` 可用。

    // 尝试在SillyTavern核心初始化完成后再进行操作。
    // SillyTavern 可能有一个类似 'core_init_done' 或 'tavern_setup_complete' 的事件。
    // 如果没有明确的事件，我们可以用一个简单的延迟重试机制。

    let initializeAttempts = 0;
    const maxInitializeAttempts = 20; // 尝试10秒 (20 * 500ms)
    function attemptInitializeExtension() {
        initializeAttempts++;
        if (window.SillyTavern && typeof SillyTavern.renderExtensionTemplateAsync === 'function' && window.$ && $('#extensions_settings').length) {
            console.log(`${PLUGIN_NAME}: Core functions and target container are now available. Initializing settings related logic.`);

            // 在这里，我们可以假设SillyTavern的扩展设置齿轮按钮已经可以工作了。
            // 我们需要一种方式，当用户点击那个齿轮时，才调用 displayExtensionSettings()。
            // 如果SillyTavern只是打开 #extensions_settings 面板，然后期望扩展自己填充，
            // 那么，我们需要监听 #extensions_settings 面板的显示事件，或者在它可见时填充。

            // **一个简化的假设：如果manifest.json中的 settings_display_file 被指定了，**
            // **SillyTavern在用户点击设置齿轮时，会清空并显示 #extensions_settings 区域，**
            // **然后可能期望对应的扩展JS去“认领”并填充它。**
            // **在这种情况下，`displayExtensionSettings` 需要在用户点击设置时被触发。**

            // 暂时，为了测试，我们直接暴露这个函数，并假设SillyTavern会找到并调用它
            // 或者，你可以手动从浏览器控制台调用 `SillyTavern.extensions.brTagsVisibility.showSettings()` 来测试
            if (SillyTavern.extensions && SillyTavern.extensions.brTagsVisibility) {
                SillyTavern.extensions.brTagsVisibility.showSettings = displayExtensionSettings;
                console.log(`${PLUGIN_NAME}: Made showSettings available at SillyTavern.extensions.brTagsVisibility.showSettings`);
                // 如果SillyTavern自动调用一个特定名称的函数，例如：
                // window.onDisplayExtensionSettings_br_tags_visibility = displayExtensionSettings;
            } else {
                // 备份方案，如果上面的命名空间没准备好
                window.showBrTagsVisibilitySettings = displayExtensionSettings;
                 console.log(`${PLUGIN_NAME}: Made showSettings available at window.showBrTagsVisibilitySettings`);
            }

            // 初始应用可见性规则
            if (!context && SillyTavern.getContext) context = SillyTavern.getContext(); // 确保context已获取
            applyBrVisibility();
            eventSource.on(event_types.SETTINGS_UPDATED, applyBrVisibility); // 这个监听器应该没问题

        } else if (initializeAttempts < maxInitializeAttempts) {
            console.log(`${PLUGIN_NAME}: Waiting for SillyTavern core functions and target container... Attempt ${initializeAttempts}/${maxInitializeAttempts}`);
            setTimeout(attemptInitializeExtension, 500); // 每500ms重试一次
        } else {
            console.error(`${PLUGIN_NAME}: Failed to initialize after ${maxInitializeAttempts} attempts. SillyTavern.renderExtensionTemplateAsync or target container not found.`);
            // 可以在UI上提示用户扩展加载失败
        }
    }

    // 启动初始化尝试
    attemptInitializeExtension();


    console.log(`SillyTavern Extension: ${PLUGIN_NAME} (BR标签显隐控制) is loading and will attempt initialization.`);

})();
