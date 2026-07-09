import { useTranslation } from "react-i18next";

export function LanguageSwitcher() {
  const { i18n } = useTranslation();

  const toggleLanguage = () => {
    const newLang = i18n.language === "zh" ? "en" : "zh";
    i18n.changeLanguage(newLang);
  };

  return (
    <button
      type="button"
      className="langSwitcher"
      onClick={toggleLanguage}
      title={i18n.language === "zh" ? "Switch to English" : "切换到中文"}
    >
      {i18n.language === "zh" ? "EN" : "中文"}
    </button>
  );
}
