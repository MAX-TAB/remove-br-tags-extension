// remove-br-tags-extension/index.js

// 导入SillyTavern的必要模块
import { extension_settings, getContext, loadExtensionSettings } from "../../../extensions.js";
import { saveSettingsDebounced } from "../../../../script.js";

// 插件名称，应与文件夹名称一致，用于设置存储
const extensionName = "remove-br-tags-extension";
const extensionFolderPath = `scripts/extensions/third-party/${extensionName}`;

// 插件的默认设置
const defaultSettings = {
    hideBrInChat: false,    // 是否隐藏聊天消息中的 <br>
    hideBrGlobal: false,    // 是否隐藏全局的 <br>
};

// 用于动态添加/移除CSS规则的 <style> 标签的ID
const STYLE_TAG_ID = "br-visibility-dynamic-styles";

/**
 * 获取插件设置。
 * 此函数确保 extension_settings[extensionName] 存在，并且包含所有默认键。
 * 它返回对全局 extension_settings[extensionName] 对象的直接引用。
 * @returns {object} 插件的当前设置对象 (直接引用 extension_settings[extensionName])
 */
function getPluginSettings() {
    // loadExtensionSettings 函数 (在 loadSettings 中调用) 应该已经处理了
    // extension_settings[extensionName] 的初始化和从存储中加载。
    // 这里我们确保如果由于某种原因它仍未定义，或者在插件更新后缺少新的默认键，
    // 它会被正确地构建。
    if (!extension_settings[extensionName]) {
        // 这种情况在正常流程下不应发生，因为 loadExtensionSettings 会处理。
        // 如果发生了，控制台会打印警告，并用默认值初始化。
        console.warn(`[${extensionName}] Settings object not found, initializing with defaults. This should have been handled by loadExtensionSettings.`);
        extension_settings[extensionName] = { ...defaultSettings };
    }

    // 确保所有在 defaultSettings 中定义的键都存在于当前设置中。
    // 这对于在插件更新后添加新的设置项非常有用，可以保证向后兼容。
    let settingsChanged = false;
    for (const key in defaultSettings) {
        if (extension_settings[extensionName][key] === undefined) {
            extension_settings[extensionName][key] = defaultSettings[key];
            settingsChanged = true; // 标记设置已更改，以便在必要时保存
        }
    }
    // 如果因为补充默认键而修改了设置，则保存一次（尽管不常见）
    if (settingsChanged) {
        console.log(`[${extensionName}] Applied default values for new settings keys.`);
        saveSettingsDebounced();
    }

    return extension_settings[extensionName];
}

/**
 * 应用当前的 <br> 标签显示/隐藏设置。
 * 通过动态创建或更新一个 <style> 标签来实现。
 */
function applyBrVisibility() {
    const settings = getPluginSettings(); // 获取最新的、经过验证的设置
    let cssRules = "";

    // 规则1: 控制聊天消息中的 <br>
    // .mes_text 是常见的聊天文本容器，但根据SillyTavern版本或主题可能有所不同
    // .mes .force-user-msg 和 .mes .force-char-msg 是针对强制消息样式的补充
    if (settings.hideBrInChat) {
        cssRules += `
            .mes_text br,
            .mes .force-user-msg br,
            .mes .force-char-msg br,
            div[class*="chat"] div[id^="chatMessage"] br, /* 尝试更通用的聊天消息选择器 */
            .message-content br { /* 另一个常见的类名 */
                display: none !important;
            }
        `;
    } else {
        // 如果不隐藏，确保它们恢复默认显示 (通常是 'block' 或 'inline'，'revert' 更安全)
        cssRules += `
            .mes_text br,
            .mes .force-user-msg br,
            .mes .force-char-msg br,
            div[class*="chat"] div[id^="chatMessage"] br,
            .message-content br {
                display: revert !important;
            }
        `;
    }

    // 规则2: 控制全局的 <br>
    if (settings.hideBrGlobal) {
        cssRules += `
            body br {
                display: none !important;
            }
            /* 你可以在这里添加排除特定区域 <br> 标签的规则，如果需要的话 */
            /* 例如: #important-ui-element br { display: revert !important; } */
        `;
    } else {
         cssRules += `
            body br {
                display: revert !important;
            }
        `;
    }

    // 获取或创建 <style> 标签
    let styleTag = document.getElementById(STYLE_TAG_ID);
    if (!styleTag) {
        styleTag = document.createElement('style');
        styleTag.id = STYLE_TAG_ID;
        styleTag.type = 'text/css';
        document.head.appendChild(styleTag);
    }

    // 更新 <style> 标签的内容
    styleTag.textContent = cssRules;
    // console.log(`[${extensionName}] BR visibility rules applied. Chat: ${settings.hideBrInChat}, Global: ${settings.hideBrGlobal}`);
}


/**
 * 当 "隐藏聊天消息中的 <br>" 复选框状态改变时调用。
 * @param {Event} event - 输入事件对象
 */
function onChatBrToggle(event) {
    const settings = getPluginSettings(); // 获取对 extension_settings[extensionName] 的引用
    settings.hideBrInChat = Boolean(event.target.checked); // 直接修改全局设置对象中的值
    saveSettingsDebounced(); // 保存更改到持久化存储
    applyBrVisibility();     // 实时应用视觉更改
    // console.log(`[${extensionName}] Chat BR setting changed to: ${settings.hideBrInChat}`);
}

/**
 * 当 "隐藏整个界面中的 <br>" 复选框状态改变时调用。
 * @param {Event} event - 输入事件对象
 */
function onGlobalBrToggle(event) {
    const settings = getPluginSettings(); // 获取对 extension_settings[extensionName] 的引用
    settings.hideBrGlobal = Boolean(event.target.checked); // 直接修改
    saveSettingsDebounced(); // 保存
    applyBrVisibility();     // 应用

    if (settings.hideBrGlobal) {
        toastr.warning(
            "全局隐藏 <br> 标签已启用。如果界面显示异常，请禁用此选项。",
            "BR标签控制警告",
            { timeOut: 7000, preventDuplicates: true }
        );
    }
    // console.log(`[${extensionName}] Global BR setting changed to: ${settings.hideBrGlobal}`);
}

/**
 * 加载插件设置并更新UI元素的状态。
 * 这是插件初始化时设置持久化状态的关键函数。
 */
async function loadSettingsAndUpdateUI() {
    // 1. 加载设置:
    // loadExtensionSettings 会从SillyTavern的存储中异步加载设置到 extension_settings[extensionName]。
    // 如果存储中没有该插件的设置，它会使用提供的 defaultSettings 来初始化 extension_settings[extensionName]。
    await loadExtensionSettings(extensionName, defaultSettings);

    // 2. 获取经过加载/初始化的设置:
    // 此时调用 getPluginSettings() 会返回已包含正确数据的 extension_settings[extensionName]。
    // getPluginSettings 内部还会处理 defaultSettings 中新增键的合并。
    const settings = getPluginSettings();

    // 3. 更新UI元素 (复选框) 的状态以匹配加载的设置:
    const chatCheckbox = document.getElementById('st-br-control-chat');
    if (chatCheckbox) {
        chatCheckbox.checked = settings.hideBrInChat;
    } else {
        console.warn(`[${extensionName}] Chat control checkbox (#st-br-control-chat) not found.`);
    }

    const globalCheckbox = document.getElementById('st-br-control-global');
    if (globalCheckbox) {
        globalCheckbox.checked = settings.hideBrGlobal;
    } else {
        console.warn(`[${extensionName}] Global control checkbox (#st-br-control-global) not found.`);
    }

    // 4. 应用初始的CSS规则:
    // 根据加载的设置，立即应用相应的显示/隐藏规则。
    applyBrVisibility();

    console.log(`[${extensionName}] Settings loaded and UI updated. Chat BR hidden: ${settings.hideBrInChat}, Global BR hidden: ${settings.hideBrGlobal}`);
}

// 当SillyTavern加载此插件时执行 (jQuery的DOM ready类似功能)
jQuery(async () => {
    try {
        // 1. 加载并插入设置界面的HTML
        const settingsHtmlPath = `${extensionFolderPath}/settings.html`;
        const settingsHtml = await $.get(settingsHtmlPath);
        $("#extensions_settings").append(settingsHtml); // 通常添加到左侧主设置区域

        // 2. 为动态加载的HTML元素绑定事件监听器
        // 使用事件委托 $(document).on(...) 可以确保即使元素是后加载的，事件也能绑定成功。
        // 或者，如果确信此时HTML已完全插入，可以直接绑定 $(selector).on(...)。
        $(document).on('input', '#st-br-control-chat', onChatBrToggle);
        $(document).on('input', '#st-br-control-global', onGlobalBrToggle);

        // 3. 加载持久化的设置并更新UI及应用规则
        await loadSettingsAndUpdateUI();

        console.log(`[${extensionName}] Extension initialized successfully.`);

    } catch (error) {
        console.error(`[${extensionName}] Error during initialization:`, error);
        toastr.error(
            `插件 "${extensionName}" 初始化失败。详情请查看浏览器控制台。`,
            "插件错误",
            { timeOut: 10000 }
        );
    }
});
