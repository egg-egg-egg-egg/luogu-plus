/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{ts,tsx,html}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // 洛谷 AC 绿，作为主题色
        'luogu-ac': '#52c41a',
      },
    },
  },
  plugins: [],
};
