import type { BaseLayoutProps } from 'fumadocs-ui/layouts/shared';
import { appName, gitConfig } from './shared';
import { i18n } from '@/lib/i18n';
import { defineI18nUI } from 'fumadocs-ui/i18n';

export const i18nUI = defineI18nUI(i18n, {
  en: { displayName: 'English' },
  zh: { displayName: '中文', search: '搜索文档' },
  ru: { displayName: 'Русский', search: 'Поиск' },
  ko: { displayName: '한국어', search: '문서 검색' },
  ja: { displayName: '日本語', search: 'ドキュメント検索' },
});

export function baseOptions(): BaseLayoutProps {
  return {
    nav: {
      title: (
        <div className="flex items-center gap-2">
          <img src="/logo_foxblaze.png" alt="FoxBlaze Logo" className="w-8 h-8 rounded-full" />
          <span className="font-semibold">{appName}</span>
        </div>
      ),
    },
    githubUrl: `https://github.com/${gitConfig.user}/${gitConfig.repo}`,
  };
}
