// remove-br-tags-extension/index.js

// 导入SillyTavern的必要模块
import { extension_settings, getContext, loadExtensionSettings } from "../../../extensions.js";
import { saveSettingsDebounced } from "../../../../script.js";

// 插件名称，应与文件夹名称一致，用于设置存储
const extensionName = "remove-br-tags-extension";
const extensionFolderPath = `scripts/extensions/third-party/${extensionName}`; // 确保路径正确

// 插件的默认设置
const defaultSettings = {
    hideBrInChat: false,    // 是否隐藏聊天消息中的 <br>
    hideBrGlobal: false,    // 是否隐藏全局的 <br>
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
        extension_settings[extensionName] = { ...defaultSettings };
    }
    // 确保所有默认键都存在 (用于插件更新后添加新设置项)
    for (const key in defaultSettings) {
        if (extension_settings[extensionName][key] === undefined) {
            extension_settings[extensionName][key] = defaultSettings[key];
        }
    }
    return extension_settings[extensionName];
}

/**
 * 应用当前的 <br> 标签显示/隐藏设置
 * 这将通过动态创建或更新一个 <style> 标签来实现
 */
function applyBrVisibility() {
    const settings = getPluginSettings();
    let cssRules = "";

    // 规则1: 控制聊天消息中的 <br>
    // SillyTavern的聊天消息文本通常在 class="mes_text" 的元素内
    if (settings.hideBrInChat) {
        cssRules += `
            .mes_text br {
                display: none !important;
            }
        `;
    } else {
        // 如果不隐藏，确保它们是默认的显示方式 (通常是 block 或 inline)
        // 'revert' 会尝试恢复到浏览器或父级CSS定义的样式
        cssRules += `
            .mes_text br {
                display: revert !important;
            }
        `;
    }

    // 规则2: 控制全局的 <br>
    // 这是一个比较激进的选项，需要用户注意
    if (settings.hideBrGlobal) {
        // 尝试隐藏body下的所有br，但排除一些已知可能需要br的UI区域（如果能确定的话）
        // 为简单起见，这里直接针对 body br，并通过UI警告用户
        cssRules += `
            body br {
                display: none !important;
            }
            /* 如果希望某些特定UI的br不受影响，可以添加排除规则，例如：
            #some-critical-ui-element br {
                display: revert !important;
            }
            */
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
    // console.log(`${extensionName}: Applied BR visibility rules. Chat BR hidden: ${settings.hideBrInChat}, Global BR hidden: ${settings.hideBrGlobal}`);
}


/**
 * 当 "隐藏聊天消息中的 <br>" 复选框状态改变时调用
 * @param {Event} event - 输入事件对象
 */
function onChatBrToggle(event) {
    const settings = getPluginSettings();
    settings.hideBrInChat = Boolean(event.target.checked);
    saveSettingsDebounced(); // 保存设置
    applyBrVisibility();     // 应用更改
    // console.log(`${extensionName}: Chat BR setting changed to ${settings.hideBrInChat}`);
}

/**
 * 当 "隐藏整个界面中的 <br>" 复选框状态改变时调用
 * @param {Event} event - 输入事件对象
 */
function onGlobalBrToggle(event) {
    const settings = getPluginSettings();
    settings.hideBrGlobal = Boolean(event.target.checked);
    saveSettingsDebounced(); // 保存设置
    applyBrVisibility();     // 应用更改
    // console.log(`${extensionName}: Global BR setting changed to ${settings.hideBrGlobal}`);

    if (settings.hideBrGlobal) {
        toastr.warning(
            "全局隐藏 <br> 标签已启用。如果界面显示异常，请禁用此选项。",
            "BR标签控制警告",
            { timeOut: 7000 }
        );
    }
}

/**
 * 加载插件设置并更新UI元素的状态
 */
async function loadSettings() {
    await loadExtensionSettings(extensionName, defaultSettings); // SillyTavern的加载函数
    const settings = getPluginSettings();

    // 更新复选框的状态
    const chatCheckbox = document.getElementById('st-br-control-chat');
    if (chatCheckbox) {
        chatCheckbox.checked = settings.hideBrInChat;
    }

    const globalCheckbox = document.getElementById('st-br-control-global');
    if (globalCheckbox) {
        globalCheckbox.checked = settings.hideBrGlobal;
    }

    // 首次加载时应用CSS规则
    applyBrVisibility();
    // console.log(`${extensionName}: Settings loaded. Chat BR hidden: ${settings.hideBrInChat}, Global BR hidden: ${settings.hideBrGlobal}`);
}

// 当SillyTavern加载此插件时执行 (jQuery的ready类似功能)
jQuery(async () => {
    // 加载设置界面的HTML
    // 注意路径是相对于 SillyTavern 的根目录下的 extensions 文件夹
    const settingsHtml = await $.get(`${extensionFolderPath}/settings.html`);

    // 将HTML添加到SillyTavern的扩展设置区域
    // $("#extensions_settings") 是左侧栏，$("#extensions_settings2") 是右侧栏
    // 根据插件功能偏向，选择一个。这里我们放到主设置区域。
    $("#extensions_settings").append(settingsHtml);

    // 绑定事件监听器到复选框
    // 使用事件委托，确保在DOM更新后依然有效，或者直接绑定（如果HTML是静态插入的）
    $(document).on('input', '#st-br-control-chat', onChatBrToggle);
    $(document).on('input', '#st-br-control-global', onGlobalBrToggle);

    // 加载并应用初始设置
    await loadSettings();

    console.log(`${extensionName} extension loaded successfully.`);
});
