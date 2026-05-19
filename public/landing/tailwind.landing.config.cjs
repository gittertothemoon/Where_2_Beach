/** @type {import('tailwindcss').Config} */
module.exports = {
    content: ['./public/landing/index.html', './public/landing/scripts.js'],
    theme: {
        extend: {
            colors: {
                'mare-dark': '#004B7A',
                'mare': '#0077B6',
                'onda': '#90E0EF',
                'corallo': '#FF7B54',
                'corallo-hover': '#E66A45',
                'corallo-light': '#FFF0EC',
                'sabbia': '#FDFBF7',
                'sabbia-dark': '#F3E5AB',
            },
            fontFamily: {
                sans: ['Poppins', 'sans-serif'],
            },
            boxShadow: {
                'glow-corallo': '0 0 30px rgba(255, 123, 84, 0.5)',
                'glow-mare': '0 0 30px rgba(0, 119, 182, 0.4)',
                'soft': '0 20px 40px -15px rgba(0,0,0,0.05)',
                'glass': '0 8px 32px 0 rgba(31, 38, 135, 0.07)',
            },
            animation: {
                'float': 'float 6s ease-in-out infinite',
                'float-delayed': 'float 6s ease-in-out 3s infinite',
                'pulse-slow': 'pulse 8s cubic-bezier(0.4, 0, 0.6, 1) infinite',
                'blob': 'blob 10s infinite',
            },
            keyframes: {
                float: {
                    '0%, 100%': { transform: 'translateY(0)' },
                    '50%': { transform: 'translateY(-20px)' },
                },
                blob: {
                    '0%': { transform: 'translate(0px, 0px) scale(1)' },
                    '33%': { transform: 'translate(30px, -50px) scale(1.1)' },
                    '66%': { transform: 'translate(-20px, 20px) scale(0.9)' },
                    '100%': { transform: 'translate(0px, 0px) scale(1)' },
                },
            },
        },
    },
    plugins: [],
};
