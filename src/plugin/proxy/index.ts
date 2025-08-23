/**
 * 用 Virtual BIT Network 代理网络请求
 * @module
 */

// spell-checker: words webvpn

import VirtualBIT, { decrypt_URL, encrypt_URL } from '@ydx/virtual-bit-network'
import { config as all_config, HookCollectionType } from '../../core/index.ts'
import { logger } from '../../util/logger.ts'

// 从环境变量(GitHub Secrets)加载配置
function load_config({ match: hostnames }: { match: string[] }) {
    // 从环境变量获取GitHub Secrets
    const username = Deno.env.get('PROXY_USERNAME');
    const password = Deno.env.get('PROXY_PASSWORD');

    if (!username || !password) {
        throw new Error('VirtualBIT credentials not found in environment variables');
    }

    return { 
        secrets: { username, password }, 
        hostnames 
    };
}

// 加载配置（现在从环境变量而不是文件）
// @ts-ignore 允许扩展设置
const config = load_config(all_config.proxy);
const proxy = new VirtualBIT(config.secrets);
await proxy.sign_in();
logger.info('Signed in successfully.', { plugin: 'proxy' });

// 玄学操作：有些网站的二级页面需要先用proxy访问任意网址
await proxy.fetch('http://mec.bit.edu.cn');

export default function add_proxy_hook(hook: HookCollectionType) {
    hook.wrap('request', (original_fetch, options) => {
        if (!config.hostnames.includes((new URL(options.url)).hostname)) {
            return original_fetch(options);
        }

        const { url, ...init } = options;

        if (init.headers) {
            // 替换referer
            const headers = new Headers(init.headers);
            const referer = headers.get('Referer');
            if (referer && !(new URL(referer)).hostname.startsWith('webvpn.')) {
                headers.set('Referer', encrypt_URL(referer));
                init.headers = headers;
            }
        }

        logger.http(`Request ${url} with proxy.`, { plugin: 'proxy' });
        return proxy.fetch(url, init);
    });

    hook.after('fetch', (result) => {
        for (const n of result.notices) {
            const url = new URL(n.link);
            if (url.hostname.startsWith('webvpn.') && url.pathname.length > 1) {
                if (n.id === n.link) {
                    n.id = n.link = decrypt_URL(n.link);
                } else {
                    n.link = decrypt_URL(n.link);
                }
            }
        }
    });
}
