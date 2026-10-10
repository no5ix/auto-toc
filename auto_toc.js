// ==UserScript==
// @name         auto-toc
// @name:zh-CN   auto-toc
// @namespace    EX
// @version      1.79
// @license MIT
// @description Generate table of contents for any website. By default, it is not open. You need to go to the plug-in menu to open the switch for the website that wants to open the toc. The plug-in will remember this switch, and the toc will be generated automatically according to the switch when you open the website the next time.
// @description:zh-cn 可以为任何网站生成TOC网站目录大纲，默认显示为左侧边缘的窄标签，鼠标悬停时滑出目录面板。
// @include      http://*
// @include      https://*
// @grant        GM_registerMenuCommand
// @grant        GM.registerMenuCommand
// @grant        GM_unregisterMenuCommand
// @grant        GM.unregisterMenuCommand
// @grant        GM_setValue
// @grant        GM.setValue
// @grant        GM_getValue
// @grant        GM.getValue
// @grant        GM_addStyle
// @grant        GM.addStyle
// @compatible        chrome
// @compatible        edge
// @compatible        safari
// @supportURL        https://github.com/no5ix/auto-toc/issues
// @homepage          https://github.com/no5ix/auto-toc
// ==/UserScript==

(function () {
    "use strict";

    function isSafari() {
        return (
            /Safari/.test(navigator.userAgent) &&
            !/Chrome/.test(navigator.userAgent)
        );
    }

    function getRootWindow() {
        let w = window;
        while (w !== w.parent) {
            w = w.parent;
        }
        return w;
    }

    function getMaster(root) {
        const iframes = [].slice.apply(
            root.document.getElementsByTagName("iframe")
        );

        if (iframes.length === 0) {
            return root;
        } else {
            const largestChild = iframes
                .map((f) => ({
                    elem: f,
                    area: f.offsetWidth * f.offsetHeight,
                }))
                .sort((a, b) => b.area - a.area)[0];
            const html = root.document.documentElement;
            return largestChild.area / (html.offsetWidth * html.offsetHeight) >
                0.5
                ? largestChild.elem.contentWindow
                : root;
        }
    }

    let shouldLog = true;

    function isMasterFrame(w) {
        const root = getRootWindow();
        const master = getMaster(root);
        return w === master;
    }

    var toastCSS = `
        #smarttoc-toast {
            all: initial;
        }
        
        #smarttoc-toast * {
            all: unset;
        }
        
        #smarttoc-toast {
            display: none;
            position: fixed;
            left: 50%;
            transform: translateX(-50%);
            top: 0;
            margin: 1em 2em;
            min-width: 16em;
            text-align: center;
            padding: 1em;
            z-index: 10000;
            box-sizing: border-box;
            background-color: #017afe;
            border: 1px solid rgba(158, 158, 158, 0.22);
            color: #ffffff;
            font-size: calc(12px + 0.15vw);
            font-family: "Helvetica Neue", Helvetica, Arial, sans-serif;
            font-weight: normal;
            -webkit-font-smoothing: subpixel-antialiased;
            font-smoothing: subpixel-antialiased;
            transition: opacity 200ms ease-out, transform 200ms ease-out;
            border-radius: 18px;
            box-shadow: 0px 0px 0px 0px rgb(0 0 0 / 20%), 0px 0px 8px 0 rgb(0 0 0 / 19%);
        }
        
        #smarttoc-toast.enter {
            display: block;
            opacity: 0.01;
            transform: translate3d(-50%, -2em, 0);
        }
        
        #smarttoc-toast.enter.enter-active {
            display: block;
            opacity: 1;
            transform: translate3d(-50%, 0, 0);
        }
        
        #smarttoc-toast.leave {
            display: block;
            opacity: 1;
            transform: translate3d(-50%, 0, 0);
        }
        
        #smarttoc-toast.leave.leave-active {
            display: block;
            opacity: 0.01;
            transform: translate3d(-50%, -2em, 0);
        }
    `;

    function log() {
        if (false) {
        }
    }

    function draw(elem, color = "red") {
        if (false && elem) {
        }
    }

    function assert(condition, error) {
        if (!condition) {
            throw new Error(error);
        }
    }

    // '12px' => 12
    const num = (size = "0") =>
        typeof size === "number" ? size : +size.replace(/px/, "");

    // '12px' <= 12
    const px = (size = 0) => num(size) + "px";

    function throttle(fn, delay) {
        if (delay) {
            let timer;
            return function timerThrottled(...args) {
                clearTimeout(timer);
                timer = setTimeout(function () {
                    fn(...args);
                }, delay);
            };
        } else {
            let request;
            return function rafThrottled(...args) {
                cancelAnimationFrame(request);
                request = requestAnimationFrame(function () {
                    fn(...args);
                });
            };
        }
    }

    const safe = (str) => str.replace(/\s+/g, "-");

    const unique = (function uniqueGenerator() {
        let set = new Set();
        return function unique(str) {
            let id = 1;
            while (set.has(str)) {
                str = str.replace(/(\$\d+)?$/, "") + "$" + id;
                id++;
            }
            set.add(str);
            return str;
        };
    })();

    const getScroll = (elem, direction = "top") => {
        if (elem === document.body) {
            return direction === "top"
                ? document.documentElement.scrollTop || document.body.scrollTop
                : document.documentElement.scrollLeft ||
                      document.body.scrollLeft;
        } else {
            return direction === "top" ? elem.scrollTop : elem.scrollLeft;
        }
    };

    const setScroll = (elem, val, direction = "top") => {
        if (elem === document.body) {
            if (direction === "top") {
                document.documentElement.scrollTop = val;
                window.scrollTo(window.scrollX, val);
            } else {
                document.documentElement.scrollLeft = val;
                window.scrollTo(val, window.scrollY);
            }
        } else {
            if (direction === "top") {
                elem.scrollTop = val;
            } else {
                elem.scrollLeft = val;
            }
        }
    };

    const scrollTo = (function scrollToFactory() {
        let request;
        const easeOutQuad = function (t, b, c, d) {
            t /= d;
            return -c * t * (t - 2) + b;
        };
        return function scrollTo({
            targetElem,
            scrollElem,
            topMargin = 0,
            maxDuration = 300,
            easeFn,
            callback,
        }) {
            cancelAnimationFrame(request);
            let rect = targetElem.getBoundingClientRect();
            let endScrollTop =
                rect.top -
                (scrollElem === document.body
                    ? 0
                    : scrollElem.getBoundingClientRect().top) +
                getScroll(scrollElem) -
                topMargin;
            let startScrollTop = getScroll(scrollElem);
            let distance = endScrollTop - startScrollTop;
            let startTime;
            let ease = easeFn || easeOutQuad;
            let distanceRatio = Math.min(Math.abs(distance) / 10000, 1);
            let duration = Math.max(
                maxDuration * distanceRatio * (2 - distanceRatio),
                10
            );
            if (!maxDuration) {
                setScroll(scrollElem, endScrollTop);
                if (callback) {
                    callback();
                }
            } else {
                requestAnimationFrame(update);
            }

            function update(timestamp) {
                if (!startTime) {
                    startTime = timestamp;
                }
                let progress = (timestamp - startTime) / duration;
                if (progress < 1) {
                    setScroll(
                        scrollElem,
                        ease(
                            timestamp - startTime,
                            startScrollTop,
                            distance,
                            duration
                        )
                    );
                    requestAnimationFrame(update);
                } else {
                    setScroll(scrollElem, endScrollTop);
                    if (callback) {
                        callback();
                    }
                }
            }
        };
    })();

    function toDash(str) {
        return str.replace(/([A-Z])/g, (match, p1) => "-" + p1.toLowerCase());
    }

    function applyStyle(elem, style = {}, reset = false) {
        if (reset) {
            elem.style = "";
        }
        if (typeof style === "string") {
            elem.style = style;
        } else {
            for (let prop in style) {
                if (typeof style[prop] === "number") {
                    elem.style.setProperty(
                        toDash(prop),
                        px(style[prop]),
                        "important"
                    );
                } else {
                    elem.style.setProperty(
                        toDash(prop),
                        style[prop],
                        "important"
                    );
                }
            }
        }
    }

    function translate3d(x = 0, y = 0, z = 0) {
        return `translate3d(${Math.round(x)}px, ${Math.round(
            y
        )}px, ${Math.round(z)}px)`; // 0.5px => blurred text
    }

    function setClass(elem, names, delay) {
        if (delay === undefined) {
            elem.classList = names;
        } else {
            return setTimeout(() => {
                elem.classList = names;
            }, delay);
        }
    }

    const toast = (function toastFactory() {
        let timers = [];
        return function toast(msg, display_duration = 1600 /* ms */) {
            let toast;
            insertCSS(toastCSS, "smarttoc-toast__css");
            if (document.getElementById("smarttoc-toast")) {
                toast = document.getElementById("smarttoc-toast");
            } else {
                toast = document.createElement("DIV");
                toast.id = "smarttoc-toast";
                document.body.appendChild(toast);
            }
            toast.textContent = msg;

            timers.forEach(clearTimeout);
            toast.classList = "";

            const set = setClass.bind(null, toast);

            toast.classList = "enter";
            timers = [
                set("enter enter-active", 0),
                set("leave", display_duration),
                set("leave leave-active", display_duration),
                set("", display_duration + 200),
            ];
        };
    })();

    const insertCSS = function (css, id) {
        // if (!document.getElementById(id)) {
        let style = document.createElement("STYLE");
        style.type = "text/css";
        style.id = id;
        style.textContent = css;
        document.head.appendChild(style);
        // return
        // }
    };

    const removeCSS = function (id) {
        let styleElement = document.querySelector(`#${id}`);
        if (styleElement) {
            styleElement.parentNode.removeChild(styleElement);
        }
    };

    function shouldCollapseToc() {
        const domain2isCollapse = GM_getValue(
            "menu_GAEEScript_auto_collapse_toc"
        );
        // console.log('[shouldCollapse cccccccccccccccccccccccccccccc]', domain2isCollapse);
        // alert(domain2isCollapse[window.location.host])
        return domain2isCollapse[window.location.host];
    }

    let toc_dom = null;
    let toc_text_wrap = true;

    function getTocCss() {
        const shouldCollapse = shouldCollapseToc();
        if (shouldLog) console.log("[getTocCss]", shouldCollapse);
        return (
            `
            @media (prefers-color-scheme: dark) {
                #smarttoc.dark-scheme {
                    /* background-color: rgb(48, 52, 54); */
                }
            
                #smarttoc.dark-scheme a {
                    /* color: #ccc; */
                }
            
                #smarttoc.dark-scheme a:hover,
                #smarttoc.dark-scheme a:active {
                    /* border-left-color: #f6f6f6; */
                    /* color: #fff; */
                }
            
                #smarttoc.dark-scheme li.active>a {
                    /* border-left-color: rgb(46, 82, 154);
                    color: rgb(131, 174, 218) */
                }
            }
            
            #smarttoc {
                all: initial;
            }
            
            #smarttoc * {
                all: unset;
            }
            
            /* container */
            #smarttoc {
                display: flex;
                flex-direction: column;
                align-items: stretch;
                position: fixed;
                min-width: 12em;
                /* resize: horizontal; */
                width: 18em;
                /* max-height: calc(100vh - 368px); */
            ` +
            (shouldCollapse
                ? "max-height: 22px;"
                : "max-height: calc(100vh - 100px);") +
            `
                z-index: 18888;
                box-sizing: border-box;
                /* background-color: #fff; */
                color: gray;
                font-size: calc(12px + 0.1vw);
                font-family: \"Helvetica Neue\", Helvetica, Arial, sans-serif;
                line-height: 1.5;
                font-weight: normal;
                /* border: 1px solid rgba(158, 158, 158, 0.22); */
                -webkit-font-smoothing: subpixel-antialiased;
                font-smoothing: subpixel-antialiased;
                overflow: hidden;
                contain: content;
                /* box-shadow: 0px 0px 0px 0px rgb(0 0 0 / 20%), 0px 0px 8px 0 rgb(0 0 0 / 19%); */
                border-radius: 6px;
                transition: max-height 0.3s ease-in-out, opacity 0.3s ease-in-out;
            ` +
            (shouldCollapse ? "opacity: 0.6;" : "opacity: 1;") +
            `
            }
            
            #smarttoc:hover {
            ` +
            (shouldCollapse
                ? "max-height: calc(100vh - 100px); opacity: 1"
                : "") +
            `
            }
            
            #smarttoc.hidden {
                display: none;
            }
            
            #smarttoc .handle {
                -webkit-user-select: none;
                user-select: none;
                /* border-bottom: 1px solid rgba(158, 158, 158, 0.22); */
                padding: 0.1em 0.7em;
                font-variant-caps: inherit;
                font-variant: small-caps;
                font-size: 0.9em;
                color: gray;
                cursor: pointer;
                text-align: center;
                opacity: 0.6;
                transition: opacity 0.3s ease-in-out;
            }
            
            #smarttoc .handle:hover {
                cursor: move;
                opacity: 1;
            }
            
            #smarttoc>ul {
                flex-grow: 1;
                padding: 1em 1.3em 1.3em 1em;
                overflow-y: auto;
                overflow-x: hidden;
            ` +
            (shouldCollapse ? "opacity: 0.3;" : "opacity: 1;") +
            `
                transition: opacity 0.3s ease-in-out;
            }
            
            #smarttoc>ul:hover {
            ` +
            (shouldCollapse ? "opacity: 1;" : "") +
            `
            }
            ` +
            (isSafari()
                ? ""
                : `
            #smarttoc>ul::-webkit-scrollbar {  
                width: 3px;
                height: 1px;
            }
            
            /* 滚动条轨道样式, 空的即为隐藏 */   
            #smarttoc>ul::-webkit-scrollbar-track {
            }  
              
            /* 滚动条滑块样式 */   
            #smarttoc>ul::-webkit-scrollbar-thumb {  
                border-radius: 10px;
                background: rgb(128, 128, 128, 0);   
                transition: background 0.3s ease-in-out;
            }  
            
            #smarttoc>ul:hover::-webkit-scrollbar-thumb {
              background: rgb(128, 128, 128, 0.6);  
            }  
            `) +
            `
            /* all headings  */
            #smarttoc ul,
            #smarttoc li {
                list-style: none;
                display: block;
            }
            
            #smarttoc a {
                text-decoration: none;
                color: rgb(128, 128, 128, 0.6);
                display: block;
                line-height: 1.3;
                padding-top: 0.2em;
                padding-bottom: 0.2em;
            ` +
            (toc_text_wrap
                ? "white-space: pre-wrap;"
                : "text-overflow: ellipsis; overflow-x: hidden; white-space: nowrap;") +
            `
                margin-bottom: 0.8px;
                margin-top: 0.8px;
                transition: color 0.3s ease-in-out;
            }
            
            #smarttoc a:hover,
            #smarttoc a:active {
                /* color: #563d7c; */
                color: rgb(86, 61, 124, 1);
            }
            
            #smarttoc li.active>a {
                /* color: #563d7c; */
                color: rgb(86, 61, 124, 1);
            }
            
            /* heading level: 1 */
            #smarttoc ul {
                line-height: 2;
            }
            
            #smarttoc ul a {
                font-size: 1em;
                padding-left: 1.3em;
                cursor: pointer;
            }
            
            /* heading level: 2 (hidden only when there are too many headings)  */
            #smarttoc ul ul {
                line-height: 1.8;
            }
            
            #smarttoc.lengthy ul ul {
                display: none;
            }
            
            #smarttoc.lengthy ul li.active>ul {
                display: block;
            }
            
            #smarttoc ul ul a {
                font-size: 1em;
                padding-left: 2.7em;
            }
            
            /* heading level: 3 */
            #smarttoc ul ul ul {
                line-height: 1.7;
                /* display: none; */  /* (hidden unless parent is active) */
            }
            
            #smarttoc ul ul li.active>ul {
                display: block;
            }
            
            #smarttoc ul ul ul a {
                font-size: 1em;
                padding-left: 4em;
            }
            
            /* heading level: 4 */
            #smarttoc ul ul ul ul {
                line-height: 1.7;
                /* display: none; */  /* (hidden unless parent is active) */
            }
            
            #smarttoc ul ul ul li.active>ul {
                display: block;
            }
            
            #smarttoc ul ul ul ul a {
                font-size: 1em;
                padding-left: 5em;
            }
            
            /* heading level: 5 */
            #smarttoc ul ul ul ul ul {
                line-height: 1.7;
                /* display: none; */  /* (hidden unless parent is active) */
            }
            
            #smarttoc ul ul ul ul li.active>ul {
                display: block;
            }
            
            #smarttoc ul ul ul ul ul a {
                font-size: 1em;
                padding-left: 6em;
            }
            
            /* heading level: 6 */
            #smarttoc ul ul ul ul ul ul {
                line-height: 1.7;
                /* display: none; */  /* (hidden unless parent is active) */
            }
            
            #smarttoc ul ul ul ul ul li.active>ul {
                display: block;
            }
            
            #smarttoc ul ul ul ul ul ul a {
                font-size: 1em;
                padding-left: 7em;
            }

            /* Apple-inspired floating right-edge TOC drawer */
            #smarttoc.octotree-edge {
                position: fixed !important;
                top: 0 !important;
                right: 0 !important;
                left: auto !important;
                width: 324px !important;
                min-width: 0 !important;
                height: 100vh !important;
                max-height: 100vh !important;
                padding: 0 !important;
                margin: 0 !important;
                overflow: visible !important;
                pointer-events: none !important;
                box-sizing: border-box !important;
                border: 0 !important;
                border-radius: 0 !important;
                background: transparent !important;
                color: #e5e7eb !important;
                box-shadow: none !important;
                transform: none !important;
                opacity: 1 !important;
                contain: layout style !important;
                transition: none !important;
                z-index: 2147483000 !important;
                font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", sans-serif !important;
                -webkit-font-smoothing: antialiased !important;
            }

            /* The root is a full-size, transparent interaction layer. Only the tab and
               the open panel receive pointer events, so no invisible edge strip opens it. */
            #smarttoc.octotree-edge .handle { pointer-events: auto !important; }
            #smarttoc.octotree-edge .toc-panel { pointer-events: none !important; }
            #smarttoc.octotree-edge:has(.handle:hover):not(:has(.handle-drag-grip:hover)),
            #smarttoc.octotree-edge:has(.toc-panel:hover),
            #smarttoc.octotree-edge:focus-within,
            #smarttoc.octotree-edge.pinned { width: 324px !important; }

            /* In pinned mode reserve exactly the drawer width. Keep html full-width so
               the body/page shell does not get shrunk twice and leave a gap. */
            html.autotoc-pinned-layout {
                width: 100% !important;
                max-width: 100% !important;
                box-sizing: border-box !important;
                overflow-x: clip !important;
            }
            html.autotoc-pinned-layout body {
                width: calc(100vw - 324px) !important;
                max-width: calc(100vw - 324px) !important;
                margin-right: 0 !important;
                box-sizing: border-box !important;
            }
            /* Keep full-width page shells and fixed/sticky headers inside the reduced viewport. */
            html.autotoc-pinned-layout body > *,
            html.autotoc-pinned-layout body > * > * {
                max-width: calc(100vw - 324px) !important;
                box-sizing: border-box !important;
            }
            html.autotoc-pinned-layout body [style*="position: fixed"],
            html.autotoc-pinned-layout body [style*="position:fixed"] {
                max-width: calc(100vw - 324px) !important;
            }

            #smarttoc.octotree-edge .handle {
                position: absolute !important;
                top: var(--smarttoc-handle-top, 38%) !important;
                right: 0 !important;
                left: auto !important;
                width: 30px !important;
                height: 90px !important;
                min-height: 0 !important;
                box-sizing: border-box !important;
                display: flex !important;
                align-items: center !important;
                justify-content: center !important;
                gap: 4px !important;
                padding: 7px 5px 16px !important;
                border: 1px solid rgba(255,255,255,.14) !important;
                border-right: 0 !important;
                border-radius: 14px 0 0 14px !important;
                background: rgba(35, 37, 42, .88) !important;
                -webkit-backdrop-filter: blur(24px) saturate(180%) !important;
                backdrop-filter: blur(24px) saturate(180%) !important;
                color: #f5f5f7 !important;
                font-size: 12px !important;
                font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif !important;
                font-variant: normal !important;
                font-weight: 600 !important;
                letter-spacing: 0 !important;
                writing-mode: vertical-rl !important;
                transform: none !important;
                opacity: 1 !important;
                cursor: grab !important;
                user-select: none !important;
                touch-action: none !important;
                z-index: 5 !important;
                box-shadow: 0 4px 18px rgba(0,0,0,.16) !important;
                transition: background 180ms ease, border-color 180ms ease !important;
            }
            #smarttoc.octotree-edge .handle:active { cursor: grabbing !important; }
            #smarttoc.octotree-edge .handle:hover {
                background: rgba(54, 57, 64, .96) !important;
                border-color: rgba(255,255,255,.24) !important;
            }
            #smarttoc.octotree-edge .handle .handle-chevron {
                display: block !important;
                font-size: 20px !important;
                line-height: 1 !important;
                font-weight: 400 !important;
                color: #f5f5f7 !important;
            }
            #smarttoc.octotree-edge .handle .handle-label {
                display: block !important;
                color: #0a84ff !important;
                font-size: 11px !important;
                line-height: 1 !important;
                font-weight: 650 !important;
            }
            #smarttoc.octotree-edge .handle .handle-drag-grip {
                position: absolute !important;
                bottom: 0 !important;
                left: 0 !important;
                width: 100% !important;
                height: 15px !important;
                display: flex !important;
                align-items: center !important;
                justify-content: center !important;
                writing-mode: horizontal-tb !important;
                color: rgba(245,245,247,.58) !important;
                font-size: 13px !important;
                line-height: 1 !important;
                letter-spacing: -2px !important;
                cursor: ns-resize !important;
                touch-action: none !important;
                border-radius: 0 0 13px 13px !important;
                z-index: 2 !important;
            }
            #smarttoc.octotree-edge .handle .handle-label {
                max-height: 58px !important;
                overflow: hidden !important;
                flex: 0 1 auto !important;
                pointer-events: none !important;
            }
            #smarttoc.octotree-edge .handle .handle-chevron {
                flex: 0 0 auto !important;
                pointer-events: none !important;
            }
            #smarttoc.octotree-edge .handle .handle-drag-grip:hover {
                color: #f5f5f7 !important;
                background: rgba(255,255,255,.08) !important;
            }

            #smarttoc.octotree-edge .toc-panel {
                position: absolute !important;
                top: 0 !important;
                right: 0 !important;
                bottom: 0 !important;
                width: 324px !important;
                height: auto !important;
                box-sizing: border-box !important;
                overflow: hidden !important;
                background: rgba(28, 29, 33, .94) !important;
                -webkit-backdrop-filter: blur(30px) saturate(165%) !important;
                backdrop-filter: blur(30px) saturate(165%) !important;
                color: #e5e5ea !important;
                border: 1px solid rgba(255,255,255,.10) !important;
                border-radius: 0 !important;
                box-shadow: 0 18px 55px rgba(0,0,0,.32), 0 2px 8px rgba(0,0,0,.14) !important;
                transform: translateX(calc(100% + 2px)) !important;
                transition: transform 260ms cubic-bezier(.2,.75,.25,1) !important;
                display: flex !important;
                flex-direction: column !important;
            }
            #smarttoc.octotree-edge:has(.handle:hover):not(:has(.handle-drag-grip:hover)) .toc-panel,
            #smarttoc.octotree-edge:has(.toc-panel:hover) .toc-panel,
            #smarttoc.octotree-edge:focus-within .toc-panel,
            #smarttoc.octotree-edge.pinned .toc-panel {
                transform: translateX(0) !important;
                pointer-events: auto !important;
            }
            /* The edge handle retreats behind the drawer as soon as it opens. */
            #smarttoc.octotree-edge:has(.handle:hover):not(:has(.handle-drag-grip:hover)) .handle,
            #smarttoc.octotree-edge:has(.toc-panel:hover) .handle,
            #smarttoc.octotree-edge:focus-within .handle,
            #smarttoc.octotree-edge.pinned .handle {
                opacity: 0 !important;
                visibility: hidden !important;
                pointer-events: none !important;
                transform: translateX(100%) !important;
                transition: opacity 120ms ease, transform 220ms cubic-bezier(.2,.75,.25,1), visibility 0s linear 220ms !important;
            }
            #smarttoc.octotree-edge .handle {
                transition: opacity 120ms ease, transform 220ms cubic-bezier(.2,.75,.25,1), background 180ms ease, border-color 180ms ease !important;
            }

            #smarttoc.octotree-edge .toc-toolbar {
                flex: 0 0 58px !important;
                height: 58px !important;
                box-sizing: border-box !important;
                display: flex !important;
                align-items: center !important;
                justify-content: flex-end !important;
                gap: 6px !important;
                padding: 0 14px 0 18px !important;
                border-bottom: 1px solid rgba(255,255,255,.075) !important;
                background: rgba(255,255,255,.018) !important;
            }
            #smarttoc.octotree-edge .toc-toolbar button {
                all: unset !important;
                box-sizing: border-box !important;
                display: inline-flex !important;
                flex: 0 0 32px !important;
                align-items: center !important;
                justify-content: center !important;
                width: 32px !important;
                height: 32px !important;
                border-radius: 10px !important;
                color: #a1a1aa !important;
                font: 18px/1 -apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif !important;
                cursor: pointer !important;
                transition: color 160ms ease, background 160ms ease, transform 160ms ease !important;
            }
            #smarttoc.octotree-edge .toc-toolbar button:hover,
            #smarttoc.octotree-edge .toc-toolbar button[aria-pressed="true"] {
                color: #0a84ff !important;
                background: rgba(10,132,255,.12) !important;
            }
            #smarttoc.octotree-edge .toc-toolbar button:active { transform: scale(.94) !important; }
            #smarttoc.octotree-edge .toc-toolbar .toc-toolbar-title {
                margin-right: auto !important;
                color: #f5f5f7 !important;
                font-size: 16px !important;
                font-weight: 650 !important;
                letter-spacing: -.025em !important;
                white-space: nowrap !important;
            }

            #smarttoc.octotree-edge .toc-panel > ul {
                position: relative !important;
                display: block !important;
                flex: 1 1 auto !important;
                width: 100% !important;
                height: auto !important;
                min-height: 0 !important;
                box-sizing: border-box !important;
                margin: 0 !important;
                padding: 12px 10px 18px 10px !important;
                overflow-y: auto !important;
                overflow-x: hidden !important;
                background: transparent !important;
                color: #e5e5ea !important;
                opacity: 1 !important;
                transform: none !important;
                scrollbar-width: thin !important;
                scrollbar-color: rgba(142,142,147,.42) transparent !important;
            }
            #smarttoc.octotree-edge .toc-panel ul,
            #smarttoc.octotree-edge .toc-panel li { list-style: none !important; }
            #smarttoc.octotree-edge .toc-panel li { display: block !important; margin: 1px 0 !important; padding: 0 !important; }
            #smarttoc.octotree-edge .toc-row {
                display: flex !important;
                align-items: center !important;
                min-height: 34px !important;
                gap: 3px !important;
                border-radius: 9px !important;
                transition: background 140ms ease !important;
            }
            #smarttoc.octotree-edge .toc-expander {
                all: unset !important;
                flex: 0 0 22px !important;
                width: 22px !important;
                height: 30px !important;
                display: inline-flex !important;
                align-items: center !important;
                justify-content: center !important;
                color: #8e8e93 !important;
                font: 12px/1 -apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif !important;
                cursor: pointer !important;
                border-radius: 7px !important;
                transition: color 140ms ease, background 140ms ease !important;
            }
            #smarttoc.octotree-edge .toc-expander:hover { background: rgba(142,142,147,.15) !important; color: #f5f5f7 !important; }
            #smarttoc.octotree-edge .toc-expander.empty { cursor: default !important; }
            #smarttoc.octotree-edge .toc-row > a {
                all: unset !important;
                box-sizing: border-box !important;
                display: flex !important;
                flex: 1 1 auto !important;
                min-width: 0 !important;
                align-items: baseline !important;
                gap: 9px !important;
                padding: 6px 8px !important;
                border: 1px solid transparent !important;
                border-radius: 8px !important;
                color: #b7b7bf !important;
                font: 13px/1.48 -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", sans-serif !important;
                letter-spacing: -.008em !important;
                text-decoration: none !important;
                cursor: pointer !important;
                white-space: normal !important;
                overflow-wrap: anywhere !important;
                transition: color 140ms ease, background 140ms ease, border-color 140ms ease !important;
            }
            #smarttoc.octotree-edge .toc-row > a:hover {
                color: #f5f5f7 !important;
                background: rgba(142,142,147,.12) !important;
            }
            #smarttoc.octotree-edge li.active > .toc-row > a {
                color: #ffffff !important;
                border-color: transparent !important;
                background: transparent !important;
                font-weight: 650 !important;
            }
            #smarttoc.octotree-edge .toc-level-icon {
                flex: 0 0 14px !important;
                width: 14px !important;
                display: inline-block !important;
                color: #8e8e93 !important;
                text-align: center !important;
                font-size: 11px !important;
                line-height: 1 !important;
            }
            #smarttoc.octotree-edge li.active > .toc-row .toc-level-icon { color: inherit !important; }
            #smarttoc.octotree-edge .toc-children { display: block !important; margin: 0 !important; padding: 0 0 0 10px !important; }
            #smarttoc.octotree-edge .toc-panel ul.toc-children { margin: 0 !important; padding: 0 !important; line-height: 1.45 !important; }
            #smarttoc.octotree-edge .toc-children.is-collapsed { display: none !important; }
            #smarttoc.octotree-edge .toc-row[data-level="1"] { padding-left: 0 !important; }
            #smarttoc.octotree-edge .toc-row[data-level="2"] { padding-left: 2px !important; }
            #smarttoc.octotree-edge .toc-row[data-level="3"] { padding-left: 4px !important; }
            #smarttoc.octotree-edge .toc-row[data-level="4"] { padding-left: 6px !important; }
            #smarttoc.octotree-edge .toc-row[data-level="5"],
            #smarttoc.octotree-edge .toc-row[data-level="6"] { padding-left: 8px !important; }
            #smarttoc.octotree-edge .toc-panel > ul::-webkit-scrollbar { width: 6px !important; }
            #smarttoc.octotree-edge .toc-panel > ul::-webkit-scrollbar-thumb { border-radius: 8px !important; background: rgba(142,142,147,.32) !important; border: 2px solid transparent !important; background-clip: padding-box !important; }

            /* Follow the operating system appearance automatically. */
            @media (prefers-color-scheme: light) {
                #smarttoc.octotree-edge .handle {
                    background: rgba(250,250,252,.94) !important;
                    color: #1d1d1f !important;
                    border-color: rgba(0,0,0,.14) !important;
                    box-shadow: 0 4px 18px rgba(0,0,0,.12) !important;
                }
                #smarttoc.octotree-edge .handle:hover { background: rgba(255,255,255,.98) !important; border-color: rgba(0,0,0,.22) !important; }
                #smarttoc.octotree-edge .handle .handle-chevron { color: #1d1d1f !important; }
                #smarttoc.octotree-edge .handle .handle-label { color: #007aff !important; }
                #smarttoc.octotree-edge .handle .handle-drag-grip { color: rgba(29,29,31,.55) !important; }
                #smarttoc.octotree-edge .handle .handle-drag-grip:hover { color: #1d1d1f !important; background: rgba(0,0,0,.07) !important; }
                #smarttoc.octotree-edge .toc-panel {
                    background: rgba(250,250,252,.96) !important;
                    color: #1d1d1f !important;
                    border-color: rgba(0,0,0,.10) !important;
                    box-shadow: 0 18px 55px rgba(0,0,0,.16), 0 2px 8px rgba(0,0,0,.08) !important;
                }
                #smarttoc.octotree-edge .toc-toolbar { border-bottom-color: rgba(0,0,0,.08) !important; background: rgba(0,0,0,.018) !important; }
                #smarttoc.octotree-edge .toc-toolbar .toc-toolbar-title { color: #1d1d1f !important; }
                #smarttoc.octotree-edge .toc-toolbar button { color: #6e6e73 !important; }
                #smarttoc.octotree-edge .toc-toolbar button:hover,
                #smarttoc.octotree-edge .toc-toolbar button[aria-pressed="true"] { color: #007aff !important; background: rgba(0,122,255,.10) !important; }
                #smarttoc.octotree-edge .toc-panel > ul { color: #1d1d1f !important; scrollbar-color: rgba(60,60,67,.28) transparent !important; }
                #smarttoc.octotree-edge .toc-expander { color: #8e8e93 !important; }
                #smarttoc.octotree-edge .toc-expander:hover { color: #1d1d1f !important; background: rgba(60,60,67,.09) !important; }
                #smarttoc.octotree-edge .toc-row > a { color: #636366 !important; }
                #smarttoc.octotree-edge .toc-row > a:hover { color: #1d1d1f !important; background: rgba(60,60,67,.07) !important; }
                #smarttoc.octotree-edge li.active > .toc-row > a { color: #1d1d1f !important; background: transparent !important; border-color: transparent !important; font-weight: 700 !important; }
                #smarttoc.octotree-edge .toc-level-icon { color: #8e8e93 !important; }
                #smarttoc.octotree-edge li.active > .toc-row .toc-level-icon { color: inherit !important; }
                #smarttoc.octotree-edge .toc-panel > ul::-webkit-scrollbar-thumb { background: rgba(60,60,67,.25) !important; }
            }
            #smarttoc.octotree-edge.hidden { display: none !important; }

        `
        );
    }

    const proto = {
        subscribe(cb, emitOnSubscribe = true) {
            if (emitOnSubscribe && this.value !== undefined) {
                cb(this.value);
            }
            this.listeners.push(cb);
        },
        addDependent(dependent) {
            this.dependents.push(dependent);
        },
        update(val) {
            this.value = val;
            this.changed = true;
            this.dependents.forEach((dep) => dep.update(val));
        },
        flush() {
            if (this.changed) {
                this.changed = false;
                this.listeners.forEach((l) => l(this.value));
                this.dependents.forEach((dep) => dep.flush());
            }
        },
        unique() {
            let lastValue = this.value;
            let $unique = Stream(lastValue);
            this.subscribe((val) => {
                if (val !== lastValue) {
                    $unique(val);
                    lastValue = val;
                }
            });
            return $unique;
        },
        map(f) {
            return Stream.combine(this, f);
        },
        filter(f) {
            return this.map((output) => (f(output) ? output : undefined));
        },
        throttle(delay) {
            let $throttled = Stream(this.value);
            const emit = throttle($throttled, delay);
            this.subscribe(emit);
            return $throttled;
        },
        log(name) {
            this.subscribe((e) => console.log(`[${name}]: `, e));
            return this;
        },
    };

    function Stream(init) {
        let s = function (val) {
            if (val === undefined) return s.value;
            s.update(val);
            s.flush(val);
        };

        s.value = init;
        s.changed = false;
        s.listeners = [];
        s.dependents = [];

        return Object.assign(s, proto);
    }

    Stream.combine = function (...streams) {
        const combiner = streams.pop();
        let cached = streams.map((s) => s());
        const combined = Stream(combiner(...cached));

        streams.forEach((s, i) => {
            const dependent = {
                update(val) {
                    cached[i] = val;
                    combined.update(combiner(...cached));
                },
                flush() {
                    combined.flush();
                },
            };
            s.addDependent(dependent);
        });

        return combined;
    };

    Stream.interval = function (int) {
        let $interval = Stream();
        setInterval(() => $interval(null), int);
        return $interval;
    };

    Stream.fromEvent = function (elem, type) {
        let $event = Stream();
        elem.addEventListener(type, $event);
        return $event;
    };

    var commonjsGlobal =
        typeof window !== "undefined"
            ? window
            : typeof global !== "undefined"
            ? global
            : typeof self !== "undefined"
            ? self
            : {};

    function createCommonjsModule(fn, module) {
        return (
            (module = { exports: {} }),
            fn(module, module.exports),
            module.exports
        );
    }

    var mithril = createCommonjsModule(function (module) {
        (function () {
            "use strict";
            function Vnode(tag, key, attrs0, children, text, dom) {
                return {
                    tag: tag,
                    key: key,
                    attrs: attrs0,
                    children: children,
                    text: text,
                    dom: dom,
                    domSize: undefined,
                    state: undefined,
                    _state: undefined,
                    events: undefined,
                    instance: undefined,
                    skip: false,
                };
            }
            Vnode.normalize = function (node) {
                if (Array.isArray(node))
                    return Vnode(
                        "[",
                        undefined,
                        undefined,
                        Vnode.normalizeChildren(node),
                        undefined,
                        undefined
                    );
                if (node != null && typeof node !== "object")
                    return Vnode(
                        "#",
                        undefined,
                        undefined,
                        node === false ? "" : node,
                        undefined,
                        undefined
                    );
                return node;
            };
            Vnode.normalizeChildren = function normalizeChildren(children) {
                for (var i = 0; i < children.length; i++) {
                    children[i] = Vnode.normalize(children[i]);
                }
                return children;
            };
            var selectorParser =
                /(?:(^|#|\.)([^#\.\[\]]+))|(\[(.+?)(?:\s*=\s*("|'|)((?:\\["'\]]|.)*?)\5)?\])/g;
            var selectorCache = {};
            var hasOwn = {}.hasOwnProperty;
            function compileSelector(selector) {
                var match,
                    tag = "div",
                    classes = [],
                    attrs = {};
                while ((match = selectorParser.exec(selector))) {
                    var type = match[1],
                        value = match[2];
                    if (type === "" && value !== "") tag = value;
                    else if (type === "#") attrs.id = value;
                    else if (type === ".") classes.push(value);
                    else if (match[3][0] === "[") {
                        var attrValue = match[6];
                        if (attrValue)
                            attrValue = attrValue
                                .replace(/\\(["'])/g, "$1")
                                .replace(/\\\\/g, "\\");
                        if (match[4] === "class") classes.push(attrValue);
                        else
                            attrs[match[4]] =
                                attrValue === ""
                                    ? attrValue
                                    : attrValue || true;
                    }
                }
                if (classes.length > 0) attrs.className = classes.join(" ");
                return (selectorCache[selector] = { tag: tag, attrs: attrs });
            }
            function execSelector(state, attrs, children) {
                var hasAttrs = false,
                    childList,
                    text;
                var className = attrs.className || attrs.class;
                for (var key in state.attrs) {
                    if (hasOwn.call(state.attrs, key)) {
                        attrs[key] = state.attrs[key];
                    }
                }
                if (className !== undefined) {
                    if (attrs.class !== undefined) {
                        attrs.class = undefined;
                        attrs.className = className;
                    }
                    if (state.attrs.className != null) {
                        attrs.className =
                            state.attrs.className + " " + className;
                    }
                }
                for (let key in attrs) {
                    if (hasOwn.call(attrs, key) && key !== "key") {
                        hasAttrs = true;
                        break;
                    }
                }
                if (
                    Array.isArray(children) &&
                    children.length === 1 &&
                    children[0] != null &&
                    children[0].tag === "#"
                ) {
                    text = children[0].children;
                } else {
                    childList = children;
                }
                return Vnode(
                    state.tag,
                    attrs.key,
                    hasAttrs ? attrs : undefined,
                    childList,
                    text
                );
            }
            function hyperscript(selector) {
                // Because sloppy mode sucks
                var attrs = arguments[1],
                    start = 2,
                    children;
                if (
                    selector == null ||
                    (typeof selector !== "string" &&
                        typeof selector !== "function" &&
                        typeof selector.view !== "function")
                ) {
                    throw Error(
                        "The selector must be either a string or a component."
                    );
                }
                if (typeof selector === "string") {
                    var cached =
                        selectorCache[selector] || compileSelector(selector);
                }
                if (attrs == null) {
                    attrs = {};
                } else if (
                    typeof attrs !== "object" ||
                    attrs.tag != null ||
                    Array.isArray(attrs)
                ) {
                    attrs = {};
                    start = 1;
                }
                if (arguments.length === start + 1) {
                    children = arguments[start];
                    if (!Array.isArray(children)) children = [children];
                } else {
                    children = [];
                    while (start < arguments.length)
                        children.push(arguments[start++]);
                }
                var normalized = Vnode.normalizeChildren(children);
                if (typeof selector === "string") {
                    return execSelector(cached, attrs, normalized);
                } else {
                    return Vnode(selector, attrs.key, attrs, normalized);
                }
            }
            hyperscript.trust = function (html) {
                if (html == null) html = "";
                return Vnode(
                    "<",
                    undefined,
                    undefined,
                    html,
                    undefined,
                    undefined
                );
            };
            hyperscript.fragment = function (attrs1, children) {
                return Vnode(
                    "[",
                    attrs1.key,
                    attrs1,
                    Vnode.normalizeChildren(children),
                    undefined,
                    undefined
                );
            };
            var m = hyperscript;
            /** @constructor */
            var PromisePolyfill = function (executor) {
                if (!(this instanceof PromisePolyfill))
                    throw new Error("Promise must be called with `new`");
                if (typeof executor !== "function")
                    throw new TypeError("executor must be a function");
                var self = this,
                    resolvers = [],
                    rejectors = [],
                    resolveCurrent = handler(resolvers, true),
                    rejectCurrent = handler(rejectors, false);
                var instance = (self._instance = {
                    resolvers: resolvers,
                    rejectors: rejectors,
                });
                var callAsync =
                    typeof setImmediate === "function"
                        ? setImmediate
                        : setTimeout;
                function handler(list, shouldAbsorb) {
                    return function execute(value) {
                        var then;
                        try {
                            if (
                                shouldAbsorb &&
                                value != null &&
                                (typeof value === "object" ||
                                    typeof value === "function") &&
                                typeof (then = value.then) === "function"
                            ) {
                                if (value === self)
                                    throw new TypeError(
                                        "Promise can't be resolved w/ itself"
                                    );
                                executeOnce(then.bind(value));
                            } else {
                                callAsync(function () {
                                    if (!shouldAbsorb && list.length === 0)
                                        console.error(
                                            "Possible unhandled promise rejection:",
                                            value
                                        );
                                    for (var i = 0; i < list.length; i++)
                                        list[i](value);
                                    (resolvers.length = 0),
                                        (rejectors.length = 0);
                                    instance.state = shouldAbsorb;
                                    instance.retry = function () {
                                        execute(value);
                                    };
                                });
                            }
                        } catch (e) {
                            rejectCurrent(e);
                        }
                    };
                }
                function executeOnce(then) {
                    var runs = 0;
                    function run(fn) {
                        return function (value) {
                            if (runs++ > 0) return;
                            fn(value);
                        };
                    }
                    var onerror = run(rejectCurrent);
                    try {
                        then(run(resolveCurrent), onerror);
                    } catch (e) {
                        onerror(e);
                    }
                }
                executeOnce(executor);
            };
            PromisePolyfill.prototype.then = function (
                onFulfilled,
                onRejection
            ) {
                var self = this,
                    instance = self._instance;
                function handle(callback, list, next, state) {
                    list.push(function (value) {
                        if (typeof callback !== "function") next(value);
                        else
                            try {
                                resolveNext(callback(value));
                            } catch (e) {
                                if (rejectNext) rejectNext(e);
                            }
                    });
                    if (
                        typeof instance.retry === "function" &&
                        state === instance.state
                    )
                        instance.retry();
                }
                var resolveNext, rejectNext;
                var promise = new PromisePolyfill(function (resolve, reject) {
                    (resolveNext = resolve), (rejectNext = reject);
                });
                handle(onFulfilled, instance.resolvers, resolveNext, true),
                    handle(onRejection, instance.rejectors, rejectNext, false);
                return promise;
            };
            PromisePolyfill.prototype.catch = function (onRejection) {
                return this.then(null, onRejection);
            };
            PromisePolyfill.resolve = function (value) {
                if (value instanceof PromisePolyfill) return value;
                return new PromisePolyfill(function (resolve) {
                    resolve(value);
                });
            };
            PromisePolyfill.reject = function (value) {
                return new PromisePolyfill(function (resolve, reject) {
                    reject(value);
                });
            };
            PromisePolyfill.all = function (list) {
                return new PromisePolyfill(function (resolve, reject) {
                    var total = list.length,
                        count = 0,
                        values = [];
                    if (list.length === 0) resolve([]);
                    else
                        for (var i = 0; i < list.length; i++) {
                            (function (i) {
                                function consume(value) {
                                    count++;
                                    values[i] = value;
                                    if (count === total) resolve(values);
                                }
                                if (
                                    list[i] != null &&
                                    (typeof list[i] === "object" ||
                                        typeof list[i] === "function") &&
                                    typeof list[i].then === "function"
                                ) {
                                    list[i].then(consume, reject);
                                } else consume(list[i]);
                            })(i);
                        }
                });
            };
            PromisePolyfill.race = function (list) {
                return new PromisePolyfill(function (resolve, reject) {
                    for (var i = 0; i < list.length; i++) {
                        list[i].then(resolve, reject);
                    }
                });
            };
            if (typeof window !== "undefined") {
                if (typeof window.Promise === "undefined")
                    window.Promise = PromisePolyfill;
                let PromisePolyfill = window.Promise;
            } else if (typeof commonjsGlobal !== "undefined") {
                if (typeof commonjsGlobal.Promise === "undefined")
                    commonjsGlobal.Promise = PromisePolyfill;
                let PromisePolyfill = commonjsGlobal.Promise;
            } else {
            }
            var buildQueryString = function (object) {
                if (
                    Object.prototype.toString.call(object) !== "[object Object]"
                )
                    return "";
                var args = [];
                for (var key0 in object) {
                    destructure(key0, object[key0]);
                }
                return args.join("&");
                function destructure(key0, value) {
                    if (Array.isArray(value)) {
                        for (var i = 0; i < value.length; i++) {
                            destructure(key0 + "[" + i + "]", value[i]);
                        }
                    } else if (
                        Object.prototype.toString.call(value) ===
                        "[object Object]"
                    ) {
                        for (let i in value) {
                            destructure(key0 + "[" + i + "]", value[i]);
                        }
                    } else
                        args.push(
                            encodeURIComponent(key0) +
                                (value != null && value !== ""
                                    ? "=" + encodeURIComponent(value)
                                    : "")
                        );
                }
            };
            var FILE_PROTOCOL_REGEX = new RegExp("^file://", "i");
            var _8 = function ($window, Promise) {
                var callbackCount = 0;
                var oncompletion;
                function setCompletionCallback(callback) {
                    oncompletion = callback;
                }
                function finalizer() {
                    var count = 0;
                    function complete() {
                        if (--count === 0 && typeof oncompletion === "function")
                            oncompletion();
                    }
                    return function finalize(promise0) {
                        var then0 = promise0.then;
                        promise0.then = function () {
                            count++;
                            var next = then0.apply(promise0, arguments);
                            next.then(complete, function (e) {
                                complete();
                                if (count === 0) throw e;
                            });
                            return finalize(next);
                        };
                        return promise0;
                    };
                }
                function normalize(args, extra) {
                    if (typeof args === "string") {
                        var url = args;
                        args = extra || {};
                        if (args.url == null) args.url = url;
                    }
                    return args;
                }
                function request(args, extra) {
                    var finalize = finalizer();
                    args = normalize(args, extra);
                    var promise0 = new Promise(function (resolve, reject) {
                        if (args.method == null) args.method = "GET";
                        args.method = args.method.toUpperCase();
                        var useBody =
                            args.method === "GET" || args.method === "TRACE"
                                ? false
                                : typeof args.useBody === "boolean"
                                ? args.useBody
                                : true;
                        if (typeof args.serialize !== "function")
                            args.serialize =
                                typeof FormData !== "undefined" &&
                                args.data instanceof FormData
                                    ? function (value) {
                                          return value;
                                      }
                                    : JSON.stringify;
                        if (typeof args.deserialize !== "function")
                            args.deserialize = deserialize;
                        if (typeof args.extract !== "function")
                            args.extract = extract;
                        args.url = interpolate(args.url, args.data);
                        if (useBody) args.data = args.serialize(args.data);
                        else args.url = assemble(args.url, args.data);
                        var xhr = new $window.XMLHttpRequest(),
                            aborted = false,
                            _abort = xhr.abort;
                        xhr.abort = function abort() {
                            aborted = true;
                            _abort.call(xhr);
                        };
                        xhr.open(
                            args.method,
                            args.url,
                            typeof args.async === "boolean" ? args.async : true,
                            typeof args.user === "string"
                                ? args.user
                                : undefined,
                            typeof args.password === "string"
                                ? args.password
                                : undefined
                        );
                        if (args.serialize === JSON.stringify && useBody) {
                            xhr.setRequestHeader(
                                "Content-Type",
                                "application/json; charset=utf-8"
                            );
                        }
                        if (args.deserialize === deserialize) {
                            xhr.setRequestHeader(
                                "Accept",
                                "application/json, text/*"
                            );
                        }
                        if (args.withCredentials)
                            xhr.withCredentials = args.withCredentials;
                        for (var key in args.headers)
                            if ({}.hasOwnProperty.call(args.headers, key)) {
                                xhr.setRequestHeader(key, args.headers[key]);
                            }
                        if (typeof args.config === "function")
                            xhr = args.config(xhr, args) || xhr;
                        xhr.onreadystatechange = function () {
                            // Don't throw errors on xhr.abort().
                            if (aborted) return;
                            if (xhr.readyState === 4) {
                                try {
                                    var response =
                                        args.extract !== extract
                                            ? args.extract(xhr, args)
                                            : args.deserialize(
                                                  args.extract(xhr, args)
                                              );
                                    if (
                                        (xhr.status >= 200 &&
                                            xhr.status < 300) ||
                                        xhr.status === 304 ||
                                        FILE_PROTOCOL_REGEX.test(args.url)
                                    ) {
                                        resolve(cast(args.type, response));
                                    } else {
                                        var error = new Error(xhr.responseText);
                                        for (var key in response)
                                            error[key] = response[key];
                                        reject(error);
                                    }
                                } catch (e) {
                                    reject(e);
                                }
                            }
                        };
                        if (useBody && args.data != null) xhr.send(args.data);
                        else xhr.send();
                    });
                    return args.background === true
                        ? promise0
                        : finalize(promise0);
                }
                function jsonp(args, extra) {
                    var finalize = finalizer();
                    args = normalize(args, extra);
                    var promise0 = new Promise(function (resolve, reject) {
                        var callbackName =
                            args.callbackName ||
                            "_mithril_" +
                                Math.round(Math.random() * 1e16) +
                                "_" +
                                callbackCount++;
                        var script = $window.document.createElement("script");
                        $window[callbackName] = function (data) {
                            script.parentNode.removeChild(script);
                            resolve(cast(args.type, data));
                            delete $window[callbackName];
                        };
                        script.onerror = function () {
                            script.parentNode.removeChild(script);
                            reject(new Error("JSONP request failed"));
                            delete $window[callbackName];
                        };
                        if (args.data == null) args.data = {};
                        args.url = interpolate(args.url, args.data);
                        args.data[args.callbackKey || "callback"] =
                            callbackName;
                        script.src = assemble(args.url, args.data);
                        $window.document.documentElement.appendChild(script);
                    });
                    return args.background === true
                        ? promise0
                        : finalize(promise0);
                }
                function interpolate(url, data) {
                    if (data == null) return url;
                    var tokens = url.match(/:[^\/]+/gi) || [];
                    for (var i = 0; i < tokens.length; i++) {
                        var key = tokens[i].slice(1);
                        if (data[key] != null) {
                            url = url.replace(tokens[i], data[key]);
                        }
                    }
                    return url;
                }
                function assemble(url, data) {
                    var querystring = buildQueryString(data);
                    if (querystring !== "") {
                        var prefix = url.indexOf("?") < 0 ? "?" : "&";
                        url += prefix + querystring;
                    }
                    return url;
                }
                function deserialize(data) {
                    try {
                        return data !== "" ? JSON.parse(data) : null;
                    } catch (e) {
                        throw new Error(data);
                    }
                }
                function extract(xhr) {
                    return xhr.responseText;
                }
                function cast(type0, data) {
                    if (typeof type0 === "function") {
                        if (Array.isArray(data)) {
                            for (var i = 0; i < data.length; i++) {
                                data[i] = new type0(data[i]);
                            }
                        } else return new type0(data);
                    }
                    return data;
                }
                return {
                    request: request,
                    jsonp: jsonp,
                    setCompletionCallback: setCompletionCallback,
                };
            };
            var requestService = _8(window, PromisePolyfill);
            var coreRenderer = function ($window) {
                var $doc = $window.document;
                var $emptyFragment = $doc.createDocumentFragment();
                var nameSpace = {
                    svg: "http://www.w3.org/2000/svg",
                    math: "http://www.w3.org/1998/Math/MathML",
                };
                var onevent;
                function setEventCallback(callback) {
                    return (onevent = callback);
                }
                function getNameSpace(vnode) {
                    return (
                        (vnode.attrs && vnode.attrs.xmlns) ||
                        nameSpace[vnode.tag]
                    );
                }
                //create
                function createNodes(
                    parent,
                    vnodes,
                    start,
                    end,
                    hooks,
                    nextSibling,
                    ns
                ) {
                    for (var i = start; i < end; i++) {
                        var vnode = vnodes[i];
                        if (vnode != null) {
                            createNode(parent, vnode, hooks, ns, nextSibling);
                        }
                    }
                }
                function createNode(parent, vnode, hooks, ns, nextSibling) {
                    var tag = vnode.tag;
                    if (typeof tag === "string") {
                        vnode.state = {};
                        if (vnode.attrs != null)
                            initLifecycle(vnode.attrs, vnode, hooks);
                        switch (tag) {
                            case "#":
                                return createText(parent, vnode, nextSibling);
                            case "<":
                                return createHTML(parent, vnode, nextSibling);
                            case "[":
                                return createFragment(
                                    parent,
                                    vnode,
                                    hooks,
                                    ns,
                                    nextSibling
                                );
                            default:
                                return createElement(
                                    parent,
                                    vnode,
                                    hooks,
                                    ns,
                                    nextSibling
                                );
                        }
                    } else
                        return createComponent(
                            parent,
                            vnode,
                            hooks,
                            ns,
                            nextSibling
                        );
                }
                function createText(parent, vnode, nextSibling) {
                    vnode.dom = $doc.createTextNode(vnode.children);
                    insertNode(parent, vnode.dom, nextSibling);
                    return vnode.dom;
                }
                function createHTML(parent, vnode, nextSibling) {
                    var match1 = vnode.children.match(/^\s*?<(\w+)/im) || [];
                    var parent1 =
                        {
                            caption: "table",
                            thead: "table",
                            tbody: "table",
                            tfoot: "table",
                            tr: "tbody",
                            th: "tr",
                            td: "tr",
                            colgroup: "table",
                            col: "colgroup",
                        }[match1[1]] || "div";
                    var temp = $doc.createElement(parent1);
                    temp.innerHTML = vnode.children;
                    vnode.dom = temp.firstChild;
                    vnode.domSize = temp.childNodes.length;
                    var fragment = $doc.createDocumentFragment();
                    var child;
                    while ((child = temp.firstChild)) {
                        fragment.appendChild(child);
                    }
                    insertNode(parent, fragment, nextSibling);
                    return fragment;
                }
                function createFragment(parent, vnode, hooks, ns, nextSibling) {
                    var fragment = $doc.createDocumentFragment();
                    if (vnode.children != null) {
                        var children = vnode.children;
                        createNodes(
                            fragment,
                            children,
                            0,
                            children.length,
                            hooks,
                            null,
                            ns
                        );
                    }
                    vnode.dom = fragment.firstChild;
                    vnode.domSize = fragment.childNodes.length;
                    insertNode(parent, fragment, nextSibling);
                    return fragment;
                }
                function createElement(parent, vnode, hooks, ns, nextSibling) {
                    var tag = vnode.tag;
                    var attrs2 = vnode.attrs;
                    var is = attrs2 && attrs2.is;
                    ns = getNameSpace(vnode) || ns;
                    var element = ns
                        ? is
                            ? $doc.createElementNS(ns, tag, { is: is })
                            : $doc.createElementNS(ns, tag)
                        : is
                        ? $doc.createElement(tag, { is: is })
                        : $doc.createElement(tag);
                    vnode.dom = element;
                    if (attrs2 != null) {
                        setAttrs(vnode, attrs2, ns);
                    }
                    insertNode(parent, element, nextSibling);
                    if (
                        vnode.attrs != null &&
                        vnode.attrs.contenteditable != null
                    ) {
                        setContentEditable(vnode);
                    } else {
                        if (vnode.text != null) {
                            if (vnode.text !== "")
                                element.textContent = vnode.text;
                            else
                                vnode.children = [
                                    Vnode(
                                        "#",
                                        undefined,
                                        undefined,
                                        vnode.text,
                                        undefined,
                                        undefined
                                    ),
                                ];
                        }
                        if (vnode.children != null) {
                            var children = vnode.children;
                            createNodes(
                                element,
                                children,
                                0,
                                children.length,
                                hooks,
                                null,
                                ns
                            );
                            setLateAttrs(vnode);
                        }
                    }
                    return element;
                }
                function initComponent(vnode, hooks) {
                    var sentinel;
                    if (typeof vnode.tag.view === "function") {
                        vnode.state = Object.create(vnode.tag);
                        sentinel = vnode.state.view;
                        if (sentinel.$$reentrantLock$$ != null)
                            return $emptyFragment;
                        sentinel.$$reentrantLock$$ = true;
                    } else {
                        vnode.state = void 0;
                        sentinel = vnode.tag;
                        if (sentinel.$$reentrantLock$$ != null)
                            return $emptyFragment;
                        sentinel.$$reentrantLock$$ = true;
                        vnode.state =
                            vnode.tag.prototype != null &&
                            typeof vnode.tag.prototype.view === "function"
                                ? new vnode.tag(vnode)
                                : vnode.tag(vnode);
                    }
                    vnode._state = vnode.state;
                    if (vnode.attrs != null)
                        initLifecycle(vnode.attrs, vnode, hooks);
                    initLifecycle(vnode._state, vnode, hooks);
                    vnode.instance = Vnode.normalize(
                        vnode._state.view.call(vnode.state, vnode)
                    );
                    if (vnode.instance === vnode)
                        throw Error(
                            "A view cannot return the vnode it received as argument"
                        );
                    sentinel.$$reentrantLock$$ = null;
                }
                function createComponent(
                    parent,
                    vnode,
                    hooks,
                    ns,
                    nextSibling
                ) {
                    initComponent(vnode, hooks);
                    if (vnode.instance != null) {
                        var element = createNode(
                            parent,
                            vnode.instance,
                            hooks,
                            ns,
                            nextSibling
                        );
                        vnode.dom = vnode.instance.dom;
                        vnode.domSize =
                            vnode.dom != null ? vnode.instance.domSize : 0;
                        insertNode(parent, element, nextSibling);
                        return element;
                    } else {
                        vnode.domSize = 0;
                        return $emptyFragment;
                    }
                }
                //update
                function updateNodes(
                    parent,
                    old,
                    vnodes,
                    recycling,
                    hooks,
                    nextSibling,
                    ns
                ) {
                    if (old === vnodes || (old == null && vnodes == null))
                        return;
                    else if (old == null)
                        createNodes(
                            parent,
                            vnodes,
                            0,
                            vnodes.length,
                            hooks,
                            nextSibling,
                            ns
                        );
                    else if (vnodes == null)
                        removeNodes(old, 0, old.length, vnodes);
                    else {
                        if (old.length === vnodes.length) {
                            var isUnkeyed = false;
                            for (var i = 0; i < vnodes.length; i++) {
                                if (vnodes[i] != null && old[i] != null) {
                                    isUnkeyed =
                                        vnodes[i].key == null &&
                                        old[i].key == null;
                                    break;
                                }
                            }
                            if (isUnkeyed) {
                                for (let i = 0; i < old.length; i++) {
                                    if (old[i] === vnodes[i]) continue;
                                    else if (
                                        old[i] == null &&
                                        vnodes[i] != null
                                    )
                                        createNode(
                                            parent,
                                            vnodes[i],
                                            hooks,
                                            ns,
                                            getNextSibling(
                                                old,
                                                i + 1,
                                                nextSibling
                                            )
                                        );
                                    else if (vnodes[i] == null)
                                        removeNodes(old, i, i + 1, vnodes);
                                    else
                                        updateNode(
                                            parent,
                                            old[i],
                                            vnodes[i],
                                            hooks,
                                            getNextSibling(
                                                old,
                                                i + 1,
                                                nextSibling
                                            ),
                                            recycling,
                                            ns
                                        );
                                }
                                return;
                            }
                        }
                        recycling = recycling || isRecyclable(old, vnodes);
                        if (recycling) {
                            var pool = old.pool;
                            old = old.concat(old.pool);
                        }
                        var oldStart = 0,
                            start = 0,
                            oldEnd = old.length - 1,
                            end = vnodes.length - 1,
                            map;
                        while (oldEnd >= oldStart && end >= start) {
                            var o = old[oldStart],
                                v = vnodes[start];
                            if (o === v && !recycling) oldStart++, start++;
                            else if (o == null) oldStart++;
                            else if (v == null) start++;
                            else if (o.key === v.key) {
                                var shouldRecycle =
                                    (pool != null &&
                                        oldStart >= old.length - pool.length) ||
                                    (pool == null && recycling);
                                oldStart++, start++;
                                updateNode(
                                    parent,
                                    o,
                                    v,
                                    hooks,
                                    getNextSibling(old, oldStart, nextSibling),
                                    shouldRecycle,
                                    ns
                                );
                                if (recycling && o.tag === v.tag)
                                    insertNode(
                                        parent,
                                        toFragment(o),
                                        nextSibling
                                    );
                            } else {
                                let o = old[oldEnd];
                                if (o === v && !recycling) oldEnd--, start++;
                                else if (o == null) oldEnd--;
                                else if (v == null) start++;
                                else if (o.key === v.key) {
                                    let shouldRecycle =
                                        (pool != null &&
                                            oldEnd >=
                                                old.length - pool.length) ||
                                        (pool == null && recycling);
                                    updateNode(
                                        parent,
                                        o,
                                        v,
                                        hooks,
                                        getNextSibling(
                                            old,
                                            oldEnd + 1,
                                            nextSibling
                                        ),
                                        shouldRecycle,
                                        ns
                                    );
                                    if (recycling || start < end)
                                        insertNode(
                                            parent,
                                            toFragment(o),
                                            getNextSibling(
                                                old,
                                                oldStart,
                                                nextSibling
                                            )
                                        );
                                    oldEnd--, start++;
                                } else break;
                            }
                        }
                        while (oldEnd >= oldStart && end >= start) {
                            let o = old[oldEnd],
                                v = vnodes[end];
                            if (o === v && !recycling) oldEnd--, end--;
                            else if (o == null) oldEnd--;
                            else if (v == null) end--;
                            else if (o.key === v.key) {
                                let shouldRecycle =
                                    (pool != null &&
                                        oldEnd >= old.length - pool.length) ||
                                    (pool == null && recycling);
                                updateNode(
                                    parent,
                                    o,
                                    v,
                                    hooks,
                                    getNextSibling(
                                        old,
                                        oldEnd + 1,
                                        nextSibling
                                    ),
                                    shouldRecycle,
                                    ns
                                );
                                if (recycling && o.tag === v.tag)
                                    insertNode(
                                        parent,
                                        toFragment(o),
                                        nextSibling
                                    );
                                if (o.dom != null) nextSibling = o.dom;
                                oldEnd--, end--;
                            } else {
                                if (!map) map = getKeyMap(old, oldEnd);
                                if (v != null) {
                                    var oldIndex = map[v.key];
                                    if (oldIndex != null) {
                                        let movable = old[oldIndex];
                                        let shouldRecycle =
                                            (pool != null &&
                                                oldIndex >=
                                                    old.length - pool.length) ||
                                            (pool == null && recycling);
                                        updateNode(
                                            parent,
                                            movable,
                                            v,
                                            hooks,
                                            getNextSibling(
                                                old,
                                                oldEnd + 1,
                                                nextSibling
                                            ),
                                            recycling,
                                            ns
                                        );
                                        insertNode(
                                            parent,
                                            toFragment(movable),
                                            nextSibling
                                        );
                                        old[oldIndex].skip = true;
                                        if (movable.dom != null)
                                            nextSibling = movable.dom;
                                    } else {
                                        var dom = createNode(
                                            parent,
                                            v,
                                            hooks,
                                            ns,
                                            nextSibling
                                        );
                                        nextSibling = dom;
                                    }
                                }
                                end--;
                            }
                            if (end < start) break;
                        }
                        createNodes(
                            parent,
                            vnodes,
                            start,
                            end + 1,
                            hooks,
                            nextSibling,
                            ns
                        );
                        removeNodes(old, oldStart, oldEnd + 1, vnodes);
                    }
                }
                function updateNode(
                    parent,
                    old,
                    vnode,
                    hooks,
                    nextSibling,
                    recycling,
                    ns
                ) {
                    var oldTag = old.tag,
                        tag = vnode.tag;
                    if (oldTag === tag) {
                        vnode.state = old.state;
                        vnode._state = old._state;
                        vnode.events = old.events;
                        if (!recycling && shouldNotUpdate(vnode, old)) return;
                        if (typeof oldTag === "string") {
                            if (vnode.attrs != null) {
                                if (recycling) {
                                    vnode.state = {};
                                    initLifecycle(vnode.attrs, vnode, hooks);
                                } else
                                    updateLifecycle(vnode.attrs, vnode, hooks);
                            }
                            switch (oldTag) {
                                case "#":
                                    updateText(old, vnode);
                                    break;
                                case "<":
                                    updateHTML(parent, old, vnode, nextSibling);
                                    break;
                                case "[":
                                    updateFragment(
                                        parent,
                                        old,
                                        vnode,
                                        recycling,
                                        hooks,
                                        nextSibling,
                                        ns
                                    );
                                    break;
                                default:
                                    updateElement(
                                        old,
                                        vnode,
                                        recycling,
                                        hooks,
                                        ns
                                    );
                            }
                        } else
                            updateComponent(
                                parent,
                                old,
                                vnode,
                                hooks,
                                nextSibling,
                                recycling,
                                ns
                            );
                    } else {
                        removeNode(old, null);
                        createNode(parent, vnode, hooks, ns, nextSibling);
                    }
                }
                function updateText(old, vnode) {
                    if (old.children.toString() !== vnode.children.toString()) {
                        old.dom.nodeValue = vnode.children;
                    }
                    vnode.dom = old.dom;
                }
                function updateHTML(parent, old, vnode, nextSibling) {
                    if (old.children !== vnode.children) {
                        toFragment(old);
                        createHTML(parent, vnode, nextSibling);
                    } else (vnode.dom = old.dom), (vnode.domSize = old.domSize);
                }
                function updateFragment(
                    parent,
                    old,
                    vnode,
                    recycling,
                    hooks,
                    nextSibling,
                    ns
                ) {
                    updateNodes(
                        parent,
                        old.children,
                        vnode.children,
                        recycling,
                        hooks,
                        nextSibling,
                        ns
                    );
                    var domSize = 0,
                        children = vnode.children;
                    vnode.dom = null;
                    if (children != null) {
                        for (var i = 0; i < children.length; i++) {
                            var child = children[i];
                            if (child != null && child.dom != null) {
                                if (vnode.dom == null) vnode.dom = child.dom;
                                domSize += child.domSize || 1;
                            }
                        }
                        if (domSize !== 1) vnode.domSize = domSize;
                    }
                }
                function updateElement(old, vnode, recycling, hooks, ns) {
                    var element = (vnode.dom = old.dom);
                    ns = getNameSpace(vnode) || ns;
                    if (vnode.tag === "textarea") {
                        if (vnode.attrs == null) vnode.attrs = {};
                        if (vnode.text != null) {
                            vnode.attrs.value = vnode.text; //FIXME handle0 multiple children
                            vnode.text = undefined;
                        }
                    }
                    updateAttrs(vnode, old.attrs, vnode.attrs, ns);
                    if (
                        vnode.attrs != null &&
                        vnode.attrs.contenteditable != null
                    ) {
                        setContentEditable(vnode);
                    } else if (
                        old.text != null &&
                        vnode.text != null &&
                        vnode.text !== ""
                    ) {
                        if (old.text.toString() !== vnode.text.toString())
                            old.dom.firstChild.nodeValue = vnode.text;
                    } else {
                        if (old.text != null)
                            old.children = [
                                Vnode(
                                    "#",
                                    undefined,
                                    undefined,
                                    old.text,
                                    undefined,
                                    old.dom.firstChild
                                ),
                            ];
                        if (vnode.text != null)
                            vnode.children = [
                                Vnode(
                                    "#",
                                    undefined,
                                    undefined,
                                    vnode.text,
                                    undefined,
                                    undefined
                                ),
                            ];
                        updateNodes(
                            element,
                            old.children,
                            vnode.children,
                            recycling,
                            hooks,
                            null,
                            ns
                        );
                    }
                }
                function updateComponent(
                    parent,
                    old,
                    vnode,
                    hooks,
                    nextSibling,
                    recycling,
                    ns
                ) {
                    if (recycling) {
                        initComponent(vnode, hooks);
                    } else {
                        vnode.instance = Vnode.normalize(
                            vnode._state.view.call(vnode.state, vnode)
                        );
                        if (vnode.instance === vnode)
                            throw Error(
                                "A view cannot return the vnode it received as argument"
                            );
                        if (vnode.attrs != null)
                            updateLifecycle(vnode.attrs, vnode, hooks);
                        updateLifecycle(vnode._state, vnode, hooks);
                    }
                    if (vnode.instance != null) {
                        if (old.instance == null)
                            createNode(
                                parent,
                                vnode.instance,
                                hooks,
                                ns,
                                nextSibling
                            );
                        else
                            updateNode(
                                parent,
                                old.instance,
                                vnode.instance,
                                hooks,
                                nextSibling,
                                recycling,
                                ns
                            );
                        vnode.dom = vnode.instance.dom;
                        vnode.domSize = vnode.instance.domSize;
                    } else if (old.instance != null) {
                        removeNode(old.instance, null);
                        vnode.dom = undefined;
                        vnode.domSize = 0;
                    } else {
                        vnode.dom = old.dom;
                        vnode.domSize = old.domSize;
                    }
                }
                function isRecyclable(old, vnodes) {
                    if (
                        old.pool != null &&
                        Math.abs(old.pool.length - vnodes.length) <=
                            Math.abs(old.length - vnodes.length)
                    ) {
                        var oldChildrenLength =
                            (old[0] &&
                                old[0].children &&
                                old[0].children.length) ||
                            0;
                        var poolChildrenLength =
                            (old.pool[0] &&
                                old.pool[0].children &&
                                old.pool[0].children.length) ||
                            0;
                        var vnodesChildrenLength =
                            (vnodes[0] &&
                                vnodes[0].children &&
                                vnodes[0].children.length) ||
                            0;
                        if (
                            Math.abs(
                                poolChildrenLength - vnodesChildrenLength
                            ) <=
                            Math.abs(oldChildrenLength - vnodesChildrenLength)
                        ) {
                            return true;
                        }
                    }
                    return false;
                }
                function getKeyMap(vnodes, end) {
                    var map = {},
                        i = 0;
                    for (let i = 0; i < end; i++) {
                        let vnode = vnodes[i];
                        if (vnode != null) {
                            let key2 = vnode.key;
                            if (key2 != null) map[key2] = i;
                        }
                    }
                    return map;
                }
                function toFragment(vnode) {
                    var count0 = vnode.domSize;
                    if (count0 != null || vnode.dom == null) {
                        var fragment = $doc.createDocumentFragment();
                        if (count0 > 0) {
                            var dom = vnode.dom;
                            while (--count0)
                                fragment.appendChild(dom.nextSibling);
                            fragment.insertBefore(dom, fragment.firstChild);
                        }
                        return fragment;
                    } else return vnode.dom;
                }
                function getNextSibling(vnodes, i, nextSibling) {
                    for (; i < vnodes.length; i++) {
                        if (vnodes[i] != null && vnodes[i].dom != null)
                            return vnodes[i].dom;
                    }
                    return nextSibling;
                }
                function insertNode(parent, dom, nextSibling) {
                    if (nextSibling && nextSibling.parentNode)
                        parent.insertBefore(dom, nextSibling);
                    else parent.appendChild(dom);
                }
                function setContentEditable(vnode) {
                    var children = vnode.children;
                    if (
                        children != null &&
                        children.length === 1 &&
                        children[0].tag === "<"
                    ) {
                        var content = children[0].children;
                        if (vnode.dom.innerHTML !== content)
                            vnode.dom.innerHTML = content;
                    } else if (
                        vnode.text != null ||
                        (children != null && children.length !== 0)
                    )
                        throw new Error(
                            "Child node of a contenteditable must be trusted"
                        );
                }
                //remove
                function removeNodes(vnodes, start, end, context) {
                    for (var i = start; i < end; i++) {
                        var vnode = vnodes[i];
                        if (vnode != null) {
                            if (vnode.skip) vnode.skip = false;
                            else removeNode(vnode, context);
                        }
                    }
                }
                function removeNode(vnode, context) {
                    var expected = 1,
                        called = 0;
                    if (
                        vnode.attrs &&
                        typeof vnode.attrs.onbeforeremove === "function"
                    ) {
                        var result = vnode.attrs.onbeforeremove.call(
                            vnode.state,
                            vnode
                        );
                        if (
                            result != null &&
                            typeof result.then === "function"
                        ) {
                            expected++;
                            result.then(continuation, continuation);
                        }
                    }
                    if (
                        typeof vnode.tag !== "string" &&
                        typeof vnode._state.onbeforeremove === "function"
                    ) {
                        let result = vnode._state.onbeforeremove.call(
                            vnode.state,
                            vnode
                        );
                        if (
                            result != null &&
                            typeof result.then === "function"
                        ) {
                            expected++;
                            result.then(continuation, continuation);
                        }
                    }
                    continuation();
                    function continuation() {
                        if (++called === expected) {
                            onremove(vnode);
                            if (vnode.dom) {
                                var count0 = vnode.domSize || 1;
                                if (count0 > 1) {
                                    var dom = vnode.dom;
                                    while (--count0) {
                                        removeNodeFromDOM(dom.nextSibling);
                                    }
                                }
                                removeNodeFromDOM(vnode.dom);
                                if (
                                    context != null &&
                                    vnode.domSize == null &&
                                    !hasIntegrationMethods(vnode.attrs) &&
                                    typeof vnode.tag === "string"
                                ) {
                                    //TODO test custom elements
                                    if (!context.pool) context.pool = [vnode];
                                    else context.pool.push(vnode);
                                }
                            }
                        }
                    }
                }
                function removeNodeFromDOM(node) {
                    var parent = node.parentNode;
                    if (parent != null) parent.removeChild(node);
                }
                function onremove(vnode) {
                    if (
                        vnode.attrs &&
                        typeof vnode.attrs.onremove === "function"
                    )
                        vnode.attrs.onremove.call(vnode.state, vnode);
                    if (
                        typeof vnode.tag !== "string" &&
                        typeof vnode._state.onremove === "function"
                    )
                        vnode._state.onremove.call(vnode.state, vnode);
                    if (vnode.instance != null) onremove(vnode.instance);
                    else {
                        var children = vnode.children;
                        if (Array.isArray(children)) {
                            for (var i = 0; i < children.length; i++) {
                                var child = children[i];
                                if (child != null) onremove(child);
                            }
                        }
                    }
                }
                //attrs2
                function setAttrs(vnode, attrs2, ns) {
                    for (var key2 in attrs2) {
                        setAttr(vnode, key2, null, attrs2[key2], ns);
                    }
                }
                function setAttr(vnode, key2, old, value, ns) {
                    var element = vnode.dom;
                    if (
                        key2 === "key" ||
                        key2 === "is" ||
                        (old === value &&
                            !isFormAttribute(vnode, key2) &&
                            typeof value !== "object") ||
                        typeof value === "undefined" ||
                        isLifecycleMethod(key2)
                    )
                        return;
                    var nsLastIndex = key2.indexOf(":");
                    if (
                        nsLastIndex > -1 &&
                        key2.substr(0, nsLastIndex) === "xlink"
                    ) {
                        element.setAttributeNS(
                            "http://www.w3.org/1999/xlink",
                            key2.slice(nsLastIndex + 1),
                            value
                        );
                    } else if (
                        key2[0] === "o" &&
                        key2[1] === "n" &&
                        typeof value === "function"
                    )
                        updateEvent(vnode, key2, value);
                    else if (key2 === "style") updateStyle(element, old, value);
                    else if (
                        key2 in element &&
                        !isAttribute(key2) &&
                        ns === undefined &&
                        !isCustomElement(vnode)
                    ) {
                        if (key2 === "value") {
                            var normalized0 = "" + value; // eslint-disable-line no-implicit-coercion
                            //setting input[value] to same value by typing on focused element moves cursor to end in Chrome
                            if (
                                (vnode.tag === "input" ||
                                    vnode.tag === "textarea") &&
                                vnode.dom.value === normalized0 &&
                                vnode.dom === $doc.activeElement
                            )
                                return;
                            //setting select[value] to same value while having select open blinks select dropdown in Chrome
                            if (vnode.tag === "select") {
                                if (value === null) {
                                    if (
                                        vnode.dom.selectedIndex === -1 &&
                                        vnode.dom === $doc.activeElement
                                    )
                                        return;
                                } else {
                                    if (
                                        old !== null &&
                                        vnode.dom.value === normalized0 &&
                                        vnode.dom === $doc.activeElement
                                    )
                                        return;
                                }
                            }
                            //setting option[value] to same value while having select open blinks select dropdown in Chrome
                            if (
                                vnode.tag === "option" &&
                                old != null &&
                                vnode.dom.value === normalized0
                            )
                                return;
                        }
                        // If you assign an input type1 that is not supported by IE 11 with an assignment expression, an error0 will occur.
                        if (vnode.tag === "input" && key2 === "type") {
                            element.setAttribute(key2, value);
                            return;
                        }
                        element[key2] = value;
                    } else {
                        if (typeof value === "boolean") {
                            if (value) element.setAttribute(key2, "");
                            else element.removeAttribute(key2);
                        } else
                            element.setAttribute(
                                key2 === "className" ? "class" : key2,
                                value
                            );
                    }
                }
                function setLateAttrs(vnode) {
                    var attrs2 = vnode.attrs;
                    if (vnode.tag === "select" && attrs2 != null) {
                        if ("value" in attrs2)
                            setAttr(
                                vnode,
                                "value",
                                null,
                                attrs2.value,
                                undefined
                            );
                        if ("selectedIndex" in attrs2)
                            setAttr(
                                vnode,
                                "selectedIndex",
                                null,
                                attrs2.selectedIndex,
                                undefined
                            );
                    }
                }
                function updateAttrs(vnode, old, attrs2, ns) {
                    if (attrs2 != null) {
                        for (let key2 in attrs2) {
                            setAttr(
                                vnode,
                                key2,
                                old && old[key2],
                                attrs2[key2],
                                ns
                            );
                        }
                    }
                    if (old != null) {
                        for (var key2 in old) {
                            if (attrs2 == null || !(key2 in attrs2)) {
                                if (key2 === "className") key2 = "class";
                                if (
                                    key2[0] === "o" &&
                                    key2[1] === "n" &&
                                    !isLifecycleMethod(key2)
                                )
                                    updateEvent(vnode, key2, undefined);
                                else if (key2 !== "key")
                                    vnode.dom.removeAttribute(key2);
                            }
                        }
                    }
                }
                function isFormAttribute(vnode, attr) {
                    return (
                        attr === "value" ||
                        attr === "checked" ||
                        attr === "selectedIndex" ||
                        (attr === "selected" &&
                            vnode.dom === $doc.activeElement)
                    );
                }
                function isLifecycleMethod(attr) {
                    return (
                        attr === "oninit" ||
                        attr === "oncreate" ||
                        attr === "onupdate" ||
                        attr === "onremove" ||
                        attr === "onbeforeremove" ||
                        attr === "onbeforeupdate"
                    );
                }
                function isAttribute(attr) {
                    return (
                        attr === "href" ||
                        attr === "list" ||
                        attr === "form" ||
                        attr === "width" ||
                        attr === "height"
                    ); // || attr === "type"
                }
                function isCustomElement(vnode) {
                    return vnode.attrs.is || vnode.tag.indexOf("-") > -1;
                }
                function hasIntegrationMethods(source) {
                    return (
                        source != null &&
                        (source.oncreate ||
                            source.onupdate ||
                            source.onbeforeremove ||
                            source.onremove)
                    );
                }
                //style
                function updateStyle(element, old, style) {
                    if (old === style)
                        (element.style.cssText = ""), (old = null);
                    if (style == null) element.style.cssText = "";
                    else if (typeof style === "string")
                        element.style.cssText = style;
                    else {
                        if (typeof old === "string") element.style.cssText = "";
                        for (var key2 in style) {
                            element.style[key2] = style[key2];
                        }
                        if (old != null && typeof old !== "string") {
                            for (var key3 in old) {
                                if (!(key3 in style)) element.style[key3] = "";
                            }
                        }
                    }
                }
                //event
                function updateEvent(vnode, key2, value) {
                    var element = vnode.dom;
                    var callback =
                        typeof onevent !== "function"
                            ? value
                            : function (e) {
                                  var result = value.call(element, e);
                                  onevent.call(element, e);
                                  return result;
                              };
                    if (key2 in element)
                        element[key2] =
                            typeof value === "function" ? callback : null;
                    else {
                        var eventName = key2.slice(2);
                        if (vnode.events === undefined) vnode.events = {};
                        if (vnode.events[key2] === callback) return;
                        if (vnode.events[key2] != null)
                            element.removeEventListener(
                                eventName,
                                vnode.events[key2],
                                false
                            );
                        if (typeof value === "function") {
                            vnode.events[key2] = callback;
                            element.addEventListener(
                                eventName,
                                vnode.events[key2],
                                false
                            );
                        }
                    }
                }
                //lifecycle
                function initLifecycle(source, vnode, hooks) {
                    if (typeof source.oninit === "function")
                        source.oninit.call(vnode.state, vnode);
                    if (typeof source.oncreate === "function")
                        hooks.push(source.oncreate.bind(vnode.state, vnode));
                }
                function updateLifecycle(source, vnode, hooks) {
                    if (typeof source.onupdate === "function")
                        hooks.push(source.onupdate.bind(vnode.state, vnode));
                }
                function shouldNotUpdate(vnode, old) {
                    var forceVnodeUpdate, forceComponentUpdate;
                    if (
                        vnode.attrs != null &&
                        typeof vnode.attrs.onbeforeupdate === "function"
                    )
                        forceVnodeUpdate = vnode.attrs.onbeforeupdate.call(
                            vnode.state,
                            vnode,
                            old
                        );
                    if (
                        typeof vnode.tag !== "string" &&
                        typeof vnode._state.onbeforeupdate === "function"
                    )
                        forceComponentUpdate = vnode._state.onbeforeupdate.call(
                            vnode.state,
                            vnode,
                            old
                        );
                    if (
                        !(
                            forceVnodeUpdate === undefined &&
                            forceComponentUpdate === undefined
                        ) &&
                        !forceVnodeUpdate &&
                        !forceComponentUpdate
                    ) {
                        vnode.dom = old.dom;
                        vnode.domSize = old.domSize;
                        vnode.instance = old.instance;
                        return true;
                    }
                    return false;
                }
                function render(dom, vnodes) {
                    // let lastWidth = "";
                    // if (toc_dom) {
                    //     lastWidth = toc_dom.getBoundingClientRect().width;
                    // }
                    if (!dom)
                        throw new Error(
                            "Ensure the DOM element being passed to m.route/m.mount/m.render is not undefined."
                        );
                    var hooks = [];
                    var active = $doc.activeElement;
                    var namespace = dom.namespaceURI;
                    // First time0 rendering into a node clears it out
                    if (dom.vnodes == null) dom.textContent = "";
                    if (!Array.isArray(vnodes)) vnodes = [vnodes];
                    updateNodes(
                        dom,
                        dom.vnodes,
                        Vnode.normalizeChildren(vnodes),
                        false,
                        hooks,
                        null,
                        namespace === "http://www.w3.org/1999/xhtml"
                            ? undefined
                            : namespace
                    );
                    dom.vnodes = vnodes;
                    for (var i = 0; i < hooks.length; i++) hooks[i]();
                    if ($doc.activeElement !== active) active.focus();

                    // // 保证toc拉宽了之后, 当点击标题或滚动页面的时候不会恢复原来的宽度
                    // if (toc_dom) {
                    //     toc_dom.style.width = lastWidth + "px";
                    // }
                }
                return { render: render, setEventCallback: setEventCallback };
            };
            function throttle(callback) {
                //60fps translates to 16.6ms, round it down since setTimeout requires int
                var time = 16;
                var last = 0,
                    pending = null;
                var timeout =
                    typeof requestAnimationFrame === "function"
                        ? requestAnimationFrame
                        : setTimeout;
                return function () {
                    var now = Date.now();
                    if (last === 0 || now - last >= time) {
                        last = now;
                        callback();
                    } else if (pending === null) {
                        pending = timeout(function () {
                            pending = null;
                            callback();
                            last = Date.now();
                        }, time - (now - last));
                    }
                };
            }
            var _11 = function ($window) {
                var renderService = coreRenderer($window);
                renderService.setEventCallback(function (e) {
                    if (e.redraw === false) e.redraw = undefined;
                    else redraw();
                });
                var callbacks = [];
                function subscribe(key1, callback) {
                    unsubscribe(key1);
                    callbacks.push(key1, throttle(callback));
                }
                function unsubscribe(key1) {
                    var index = callbacks.indexOf(key1);
                    if (index > -1) callbacks.splice(index, 2);
                }
                function redraw() {
                    for (var i = 1; i < callbacks.length; i += 2) {
                        callbacks[i]();
                    }
                }
                return {
                    subscribe: subscribe,
                    unsubscribe: unsubscribe,
                    redraw: redraw,
                    render: renderService.render,
                };
            };
            var redrawService = _11(window);
            requestService.setCompletionCallback(redrawService.redraw);
            var _16 = function (redrawService0) {
                return function (root, component) {
                    if (component === null) {
                        redrawService0.render(root, []);
                        redrawService0.unsubscribe(root);
                        return;
                    }

                    if (
                        component.view == null &&
                        typeof component !== "function"
                    )
                        throw new Error(
                            "m.mount(element, component) expects a component, not a vnode"
                        );

                    var run0 = function () {
                        redrawService0.render(root, Vnode(component));
                    };
                    redrawService0.subscribe(root, run0);
                    redrawService0.redraw();
                };
            };
            m.mount = _16(redrawService);
            var Promise = PromisePolyfill;
            var parseQueryString = function (string) {
                if (string === "" || string == null) return {};
                if (string.charAt(0) === "?") string = string.slice(1);
                var entries = string.split("&"),
                    data0 = {},
                    counters = {};
                for (var i = 0; i < entries.length; i++) {
                    var entry = entries[i].split("=");
                    var key5 = decodeURIComponent(entry[0]);
                    var value =
                        entry.length === 2 ? decodeURIComponent(entry[1]) : "";
                    if (value === "true") value = true;
                    else if (value === "false") value = false;
                    var levels = key5.split(/\]\[?|\[/);
                    var cursor = data0;
                    if (key5.indexOf("[") > -1) levels.pop();
                    for (var j = 0; j < levels.length; j++) {
                        var level = levels[j],
                            nextLevel = levels[j + 1];
                        var isNumber =
                            nextLevel == "" || !isNaN(parseInt(nextLevel, 10));
                        var isValue = j === levels.length - 1;
                        if (level === "") {
                            var key6 = levels.slice(0, j).join();
                            if (counters[key6] == null) counters[key6] = 0;
                            level = counters[key6]++;
                        }
                        if (cursor[level] == null) {
                            cursor[level] = isValue
                                ? value
                                : isNumber
                                ? []
                                : {};
                        }
                        cursor = cursor[level];
                    }
                }
                return data0;
            };
            var coreRouter = function ($window) {
                var supportsPushState =
                    typeof $window.history.pushState === "function";
                var callAsync0 =
                    typeof setImmediate === "function"
                        ? setImmediate
                        : setTimeout;
                function normalize1(fragment0) {
                    var data = $window.location[fragment0].replace(
                        /(?:%[a-f89][a-f0-9])+/gim,
                        decodeURIComponent
                    );
                    if (fragment0 === "pathname" && data[0] !== "/")
                        data = "/" + data;
                    return data;
                }
                var asyncId;
                function debounceAsync(callback0) {
                    return function () {
                        if (asyncId != null) return;
                        asyncId = callAsync0(function () {
                            asyncId = null;
                            callback0();
                        });
                    };
                }
                function parsePath(path, queryData, hashData) {
                    var queryIndex = path.indexOf("?");
                    var hashIndex = path.indexOf("#");
                    var pathEnd =
                        queryIndex > -1
                            ? queryIndex
                            : hashIndex > -1
                            ? hashIndex
                            : path.length;
                    if (queryIndex > -1) {
                        var queryEnd = hashIndex > -1 ? hashIndex : path.length;
                        var queryParams = parseQueryString(
                            path.slice(queryIndex + 1, queryEnd)
                        );
                        for (var key4 in queryParams)
                            queryData[key4] = queryParams[key4];
                    }
                    if (hashIndex > -1) {
                        var hashParams = parseQueryString(
                            path.slice(hashIndex + 1)
                        );
                        for (var key5 in hashParams)
                            hashData[key5] = hashParams[key5];
                    }
                    return path.slice(0, pathEnd);
                }
                var router = { prefix: "#!" };
                router.getPath = function () {
                    var type2 = router.prefix.charAt(0);
                    switch (type2) {
                        case "#":
                            return normalize1("hash").slice(
                                router.prefix.length
                            );
                        case "?":
                            return (
                                normalize1("search").slice(
                                    router.prefix.length
                                ) + normalize1("hash")
                            );
                        default:
                            return (
                                normalize1("pathname").slice(
                                    router.prefix.length
                                ) +
                                normalize1("search") +
                                normalize1("hash")
                            );
                    }
                };
                router.setPath = function (path, data, options) {
                    var queryData = {},
                        hashData = {};
                    path = parsePath(path, queryData, hashData);
                    if (data != null) {
                        for (var key4 in data) queryData[key4] = data[key4];
                        path = path.replace(
                            /:([^\/]+)/g,
                            function (match2, token) {
                                delete queryData[token];
                                return data[token];
                            }
                        );
                    }
                    var query = buildQueryString(queryData);
                    if (query) path += "?" + query;
                    var hash = buildQueryString(hashData);
                    if (hash) path += "#" + hash;
                    if (supportsPushState) {
                        var state = options ? options.state : null;
                        var title = options ? options.title : null;
                        $window.onpopstate();
                        if (options && options.replace)
                            $window.history.replaceState(
                                state,
                                title,
                                router.prefix + path
                            );
                        else
                            $window.history.pushState(
                                state,
                                title,
                                router.prefix + path
                            );
                    } else $window.location.href = router.prefix + path;
                };
                router.defineRoutes = function (routes, resolve, reject) {
                    function resolveRoute() {
                        var path = router.getPath();
                        var params = {};
                        var pathname = parsePath(path, params, params);
                        var state = $window.history.state;
                        if (state != null) {
                            for (var k in state) params[k] = state[k];
                        }
                        for (var route0 in routes) {
                            var matcher = new RegExp(
                                "^" +
                                    route0
                                        .replace(/:[^\/]+?\.{3}/g, "(.*?)")
                                        .replace(/:[^\/]+/g, "([^\\/]+)") +
                                    "/?$"
                            );
                            if (matcher.test(pathname)) {
                                pathname.replace(matcher, function () {
                                    var keys = route0.match(/:[^\/]+/g) || [];
                                    var values = [].slice.call(
                                        arguments,
                                        1,
                                        -2
                                    );
                                    for (var i = 0; i < keys.length; i++) {
                                        params[keys[i].replace(/:|\./g, "")] =
                                            decodeURIComponent(values[i]);
                                    }
                                    resolve(
                                        routes[route0],
                                        params,
                                        path,
                                        route0
                                    );
                                });
                                return;
                            }
                        }
                        reject(path, params);
                    }
                    if (supportsPushState)
                        $window.onpopstate = debounceAsync(resolveRoute);
                    else if (router.prefix.charAt(0) === "#")
                        $window.onhashchange = resolveRoute;
                    resolveRoute();
                };
                return router;
            };
            var _20 = function ($window, redrawService0) {
                var routeService = coreRouter($window);
                var identity = function (v) {
                    return v;
                };
                var render1, component, attrs3, currentPath, lastUpdate;
                var route = function (root, defaultRoute, routes) {
                    if (root == null)
                        throw new Error(
                            "Ensure the DOM element that was passed to `m.route` is not undefined"
                        );
                    var run1 = function () {
                        if (render1 != null)
                            redrawService0.render(
                                root,
                                render1(Vnode(component, attrs3.key, attrs3))
                            );
                    };
                    var bail = function (path) {
                        if (path !== defaultRoute)
                            routeService.setPath(defaultRoute, null, {
                                replace: true,
                            });
                        else
                            throw new Error(
                                "Could not resolve default route " +
                                    defaultRoute
                            );
                    };
                    routeService.defineRoutes(
                        routes,
                        function (payload, params, path) {
                            var update = (lastUpdate = function (
                                routeResolver,
                                comp
                            ) {
                                if (update !== lastUpdate) return;
                                component =
                                    comp != null &&
                                    (typeof comp.view === "function" ||
                                        typeof comp === "function")
                                        ? comp
                                        : "div";
                                (attrs3 = params),
                                    (currentPath = path),
                                    (lastUpdate = null);
                                render1 = (
                                    routeResolver.render || identity
                                ).bind(routeResolver);
                                run1();
                            });
                            if (payload.view || typeof payload === "function")
                                update({}, payload);
                            else {
                                if (payload.onmatch) {
                                    Promise.resolve(
                                        payload.onmatch(params, path)
                                    ).then(function (resolved) {
                                        update(payload, resolved);
                                    }, bail);
                                } else update(payload, "div");
                            }
                        },
                        bail
                    );
                    redrawService0.subscribe(root, run1);
                };
                route.set = function (path, data, options) {
                    if (lastUpdate != null) {
                        options = options || {};
                        options.replace = true;
                    }
                    lastUpdate = null;
                    routeService.setPath(path, data, options);
                };
                route.get = function () {
                    return currentPath;
                };
                route.prefix = function (prefix0) {
                    routeService.prefix = prefix0;
                };
                route.link = function (vnode1) {
                    vnode1.dom.setAttribute(
                        "href",
                        routeService.prefix + vnode1.attrs.href
                    );
                    vnode1.dom.onclick = function (e) {
                        if (
                            e.ctrlKey ||
                            e.metaKey ||
                            e.shiftKey ||
                            e.which === 2
                        )
                            return;
                        e.preventDefault();
                        e.redraw = false;
                        var href = this.getAttribute("href");
                        if (href.indexOf(routeService.prefix) === 0)
                            href = href.slice(routeService.prefix.length);
                        route.set(href, undefined, undefined);
                    };
                };
                route.param = function (key3) {
                    if (
                        typeof attrs3 !== "undefined" &&
                        typeof key3 !== "undefined"
                    )
                        return attrs3[key3];
                    return attrs3;
                };
                return route;
            };
            m.route = _20(window, redrawService);
            m.withAttr = function (attrName, callback1, context) {
                return function (e) {
                    callback1.call(
                        context || this,
                        attrName in e.currentTarget
                            ? e.currentTarget[attrName]
                            : e.currentTarget.getAttribute(attrName)
                    );
                };
            };
            var _28 = coreRenderer(window);
            m.render = _28.render;
            m.redraw = redrawService.redraw;
            m.request = requestService.request;
            m.jsonp = requestService.jsonp;
            m.parseQueryString = parseQueryString;
            m.buildQueryString = buildQueryString;
            m.version = "1.1.3";
            m.vnode = Vnode;
            if ("object" !== "undefined") module["exports"] = m;
            else {
            }
        })();
    });

    const restrictScroll = function (e) {
        const toc = e.currentTarget;
        const maxScroll = toc.scrollHeight - toc.offsetHeight;
        if (toc.scrollTop + e.deltaY < 0) {
            toc.scrollTop = 0;
            e.preventDefault();
        } else if (toc.scrollTop + e.deltaY > maxScroll) {
            toc.scrollTop = maxScroll;
            e.preventDefault();
        }
        e.redraw = false;
    };

    const autoTocPinnedLayout = (() => {
        let originalHtmlWidth = null;
        let originalHtmlWidthPriority = "";
        let originalHtmlMaxWidth = null;
        let originalHtmlMaxWidthPriority = "";
        let originalBodyWidth = null;
        let originalBodyWidthPriority = "";
        let originalBodyMaxWidth = null;
        let originalBodyMaxWidthPriority = "";
        let originalBodyMarginRight = null;
        let originalBodyMarginRightPriority = "";
        return (enabled) => {
            const html = document.documentElement;
            const body = document.body;
            if (!html) return;
            if (enabled) {
                if (!html.classList.contains("autotoc-pinned-layout")) {
                    originalHtmlWidth = html.style.getPropertyValue("width");
                    originalHtmlWidthPriority = html.style.getPropertyPriority("width");
                    originalHtmlMaxWidth = html.style.getPropertyValue("max-width");
                    originalHtmlMaxWidthPriority = html.style.getPropertyPriority("max-width");
                    if (body) {
                        originalBodyWidth = body.style.getPropertyValue("width");
                        originalBodyWidthPriority = body.style.getPropertyPriority("width");
                        originalBodyMaxWidth = body.style.getPropertyValue("max-width");
                        originalBodyMaxWidthPriority = body.style.getPropertyPriority("max-width");
                        originalBodyMarginRight = body.style.getPropertyValue("margin-right");
                        originalBodyMarginRightPriority = body.style.getPropertyPriority("margin-right");
                    }
                }
                html.classList.add("autotoc-pinned-layout");
                html.style.setProperty("width", "100%", "important");
                html.style.setProperty("max-width", "100%", "important");
                if (body) {
                    body.style.setProperty("width", "calc(100vw - 324px)", "important");
                    body.style.setProperty("max-width", "calc(100vw - 324px)", "important");
                    body.style.setProperty("margin-right", "0", "important");
                }
            } else {
                html.classList.remove("autotoc-pinned-layout");
                if (originalHtmlWidth) html.style.setProperty("width", originalHtmlWidth, originalHtmlWidthPriority);
                else html.style.removeProperty("width");
                if (originalHtmlMaxWidth) html.style.setProperty("max-width", originalHtmlMaxWidth, originalHtmlMaxWidthPriority);
                else html.style.removeProperty("max-width");
                if (body) {
                    if (originalBodyWidth) body.style.setProperty("width", originalBodyWidth, originalBodyWidthPriority);
                    else body.style.removeProperty("width");
                    if (originalBodyMaxWidth) body.style.setProperty("max-width", originalBodyMaxWidth, originalBodyMaxWidthPriority);
                    else body.style.removeProperty("max-width");
                    if (originalBodyMarginRight) body.style.setProperty("margin-right", originalBodyMarginRight, originalBodyMarginRightPriority);
                    else body.style.removeProperty("margin-right");
                }
            }
            window.dispatchEvent(new Event("resize"));
        };
    })();

    const TOC = function ({ $headings, $activeHeading, onClickHeading }) {
        let expandedAll = false;
        const expandedNodes = new Set();
        let latestTree = [];
        let rootList = null;

        const toTree = function (headings) {
            const root = { level: 0, children: [] };
            const stack = [root];
            headings.forEach((heading) => {
                const node = { heading, level: heading.level || 1, children: [] };
                while (stack.length > 1 && stack[stack.length - 1].level >= node.level) stack.pop();
                stack[stack.length - 1].children.push(node);
                stack.push(node);
            });
            return root.children;
        };

        const headingText = (heading) => {
            if (heading.node.newTextContent) return heading.node.newTextContent;
            const text = heading.node.textContent.trim();
            if (text) return text;
            if (heading.node.nextElementSibling) return heading.node.nextElementSibling.textContent.trim().substring(0, 80);
            return "(untitled heading)";
        };

        const levelSymbol = (level) => ({ 1: "■", 2: "△", 3: "◆", 4: "▴", 5: "▪", 6: "▫" }[level] || "▫");

        const scrollActiveToCenter = () => {
            requestAnimationFrame(() => {
                if (!rootList) return;
                const active = rootList.querySelector("li.active > .toc-row");
                if (!active) return;
                const listRect = rootList.getBoundingClientRect();
                const rowRect = active.getBoundingClientRect();
                rootList.scrollTop += (rowRect.top + rowRect.height / 2) - (listRect.top + listRect.height / 2);
            });
        };

        const expandActivePath = () => {
            const findPath = (nodes, path = []) => {
                for (const node of nodes) {
                    const nextPath = node.heading ? [...path, node] : path;
                    if (node.heading && node.heading.isActive) return nextPath;
                    const found = findPath(node.children || [], nextPath);
                    if (found) return found;
                }
                return null;
            };
            const path = findPath(latestTree);
            if (!path) return;
            // On collapse, expose the active heading and every ancestor without expanding
            // unrelated branches. This keeps the current location understandable.
            expandedAll = false;
            path.forEach((node) => {
                if (node.children && node.children.length && node.heading) {
                    expandedNodes.add(node.heading.anchor);
                }
            });
            mithril.redraw();
            scrollActiveToCenter();
        };

        const setAllExpanded = (expand) => {
            expandedAll = expand;
            expandedNodes.clear();
            if (expand) {
                const visit = (nodes) => nodes.forEach((node) => {
                    if (node.children.length && node.heading) expandedNodes.add(node.heading.anchor);
                    visit(node.children);
                });
                visit(latestTree);
            }
            mithril.redraw();
            if (expand) scrollActiveToCenter();
        };

        const renderNodes = (nodes, isRoot = false) => mithril(
            "ul",
            {
                class: isRoot ? "toc-root-list" : "toc-children",
                onwheel: isRoot ? restrictScroll : undefined,
                onclick: isRoot ? onClickHeading : undefined,
            },
            nodes.map((node) => {
                const heading = node.heading;
                const hasChildren = node.children.length > 0;
                const expanded = expandedAll || (heading && expandedNodes.has(heading.anchor));
                const isActive = heading && heading.isActive;
                return mithril("li", {
                    key: heading ? heading.anchor : Math.random(),
                    class: isActive ? "active" : "",
                }, [
                    mithril("div.toc-row", { "data-level": node.level }, [
                        hasChildren
                            ? mithril("button.toc-expander", {
                                type: "button",
                                title: expanded ? "Collapse subheadings" : "Expand subheadings",
                                "aria-expanded": expanded ? "true" : "false",
                                onclick: (event) => {
                                    event.preventDefault();
                                    event.stopPropagation();
                                    if (expandedAll) {
                                        expandedAll = false;
                                        expandedNodes.clear();
                                    }
                                    if (expandedNodes.has(heading.anchor)) expandedNodes.delete(heading.anchor);
                                    else expandedNodes.add(heading.anchor);
                                },
                            }, expanded ? "▾" : "▸")
                            : mithril("span.toc-expander.empty", ""),
                        heading && mithril("a", {
                            href: `#${heading.anchor}`,
                            title: headingText(heading),
                            onclick: (event) => {
                                // Let the root TOC click handler perform the existing scroll logic.
                                if (event.target.closest(".toc-expander")) event.preventDefault();
                            },
                        }, [
                            mithril("span.toc-level-icon", levelSymbol(node.level)),
                            mithril("span.toc-heading-label", headingText(heading)),
                        ]),
                    ]),
                    hasChildren && mithril("div", {
                        class: `toc-children${expanded ? "" : " is-collapsed"}`,
                    }, [renderNodes(node.children)]),
                ].filter(Boolean));
            })
        );

        const toolbarButton = (symbol, title, action, pressed) => mithril("button", {
            type: "button",
            title,
            "aria-label": title,
            "aria-pressed": pressed ? "true" : "false",
            onclick: (event) => {
                event.preventDefault();
                event.stopPropagation();
                action();
            },
        }, symbol);

        return {
            oncreate({ dom }) {
                rootList = dom.querySelector(".toc-root-list");
                const smarttocRoot = document.getElementById("smarttoc");
                if (smarttocRoot && !smarttocRoot.dataset.activePathOnCollapse) {
                    smarttocRoot.dataset.activePathOnCollapse = "1";
                    smarttocRoot.addEventListener("pointerleave", (event) => {
                        // Only collapse behavior when the pointer actually leaves the whole
                        // TOC/handle area; moving from the handle into the drawer won't fire it.
                        if (!smarttocRoot.classList.contains("pinned") && !smarttocRoot.contains(event.relatedTarget)) {
                            expandActivePath();
                        }
                    });
                }
                $activeHeading.subscribe(() => {
                    const target = dom.querySelector("li.active > .toc-row");
                    if (!target || !rootList) return;
                    const rect = target.getBoundingClientRect();
                    const listRect = rootList.getBoundingClientRect();
                    if (rect.top < listRect.top || rect.bottom > listRect.bottom) {
                        scrollTo({ targetElem: target, scrollElem: rootList, maxDuration: 0,
                            topMargin: rootList.offsetHeight / 2 - target.offsetHeight / 2 });
                    }
                });
                Stream.combine($headings, $activeHeading, () => null).subscribe(() => mithril.redraw());
            },
            view() {
                $headings().forEach((heading, index) => { heading.isActive = index === $activeHeading(); });
                latestTree = toTree($headings());
                const smarttoc = document.getElementById("smarttoc");
                const pinned = !!(smarttoc && smarttoc.classList.contains("pinned"));
                return mithril("div.toc-panel", [
                    mithril("div.toc-toolbar", [
                        mithril("span.toc-toolbar-title", "Table of Contents"),
                        toolbarButton("📌", pinned ? "Unpin TOC" : "Keep TOC open", () => {
                            const root = document.getElementById("smarttoc");
                            if (root) {
                                const shouldPin = !root.classList.contains("pinned");
                                root.classList.toggle("pinned", shouldPin);
                                autoTocPinnedLayout(shouldPin);
                                mithril.redraw();
                            }
                        }, pinned),
                        toolbarButton(expandedAll ? "⊟" : "⊞", expandedAll ? "Collapse all headings" : "Expand all headings", () => setAllExpanded(!expandedAll), expandedAll),
                    ]),
                    renderNodes(latestTree, true),
                ]);
            },
        };
    };

    let multi_click_cnt = 0;
    let last_click_ts = 0;
    let last_move_ts = 0;

    const Handle = function () {
        return {
            oncreate({ dom }) {
                const root = document.getElementById("smarttoc");
                if (!root || dom.dataset.dragBound === "1") return;
                dom.dataset.dragBound = "1";
                if (root.classList.contains("pinned")) autoTocPinnedLayout(true);
                const savedTop = GM_getValue("auto_toc_edge_handle_top", null);
                if (savedTop != null) root.style.setProperty("--smarttoc-handle-top", `${savedTop}px`);
                const grip = dom.querySelector(".handle-drag-grip");
                if (!grip) return;
                let startY = 0;
                let startTop = 0;
                let dragging = false;
                grip.addEventListener("pointerdown", (event) => {
                    if (event.button !== 0) return;
                    dragging = true;
                    root.classList.add("dragging");
                    startY = event.clientY;
                    const rect = dom.getBoundingClientRect();
                    startTop = rect.top;
                    grip.setPointerCapture?.(event.pointerId);
                    event.preventDefault();
                    event.stopPropagation();
                });
                grip.addEventListener("pointermove", (event) => {
                    if (!dragging) return;
                    const maxTop = Math.max(0, window.innerHeight - dom.offsetHeight);
                    const nextTop = Math.max(0, Math.min(maxTop, startTop + event.clientY - startY));
                    root.style.setProperty("--smarttoc-handle-top", `${nextTop}px`);
                    GM_setValue("auto_toc_edge_handle_top", Math.round(nextTop));
                });
                const stopDrag = () => {
                    dragging = false;
                    root.classList.remove("dragging");
                };
                grip.addEventListener("pointerup", stopDrag);
                grip.addEventListener("pointercancel", stopDrag);
            },
            view() {
                return mithril("div.handle", { title: "Hover to open AutoTOC" }, [
                    mithril("span.handle-chevron", "›"),
                    mithril("span.handle-label", "AutoTOC"),
                    mithril("span.handle-drag-grip", { title: "Drag to reposition", "aria-label": "Drag to reposition AutoTOC" }, "☰"),
                ]);
            },
        };
    };

    // Restore the page layout if the userscript removes its TOC root during navigation.
    if (document.documentElement && !document.documentElement.dataset.autoTocPinObserver) {
        document.documentElement.dataset.autoTocPinObserver = "1";
        const pinObserver = new MutationObserver(() => {
            if (!document.getElementById("smarttoc") && document.documentElement.classList.contains("autotoc-pinned-layout")) {
                autoTocPinnedLayout(false);
            }
        });
        pinObserver.observe(document.documentElement, { childList: true, subtree: true });
    }

    const ARTICLE_TOC_GAP = 150;
    const TOP_MARGIN = 66;

    const makeSticky = function (options) {
        let {
            ref,
            scrollable,
            popper,
            direction,
            gap,
            $refChange,
            $scroll,
            $offset,
            $topMargin,
        } = options;

        let $refRect = Stream.combine($refChange, () => {
            let refRect = ref.getBoundingClientRect();
            let refStyle = window.getComputedStyle(ref);
            let scrollTop = getScroll(scrollable, "top");
            let scrollLeft = getScroll(scrollable, "left");
            let refFullRect = {
                top: refRect.top - scrollTop,
                right: refRect.right - scrollLeft,
                bottom: refRect.bottom - scrollTop,
                left: refRect.left - scrollLeft,
                width: refRect.width,
                height: refRect.height,
            };
            if (refStyle["box-sizing"] === "border-box") {
                refFullRect.left += num(refStyle["padding-left"]);
                refFullRect.right -= num(refStyle["padding-right"]);
                refFullRect.width -=
                    num(refStyle["padding-left"]) +
                    num(refStyle["padding-right"]);
            }
            return refFullRect;
        });
        let popperMetric = popper.getBoundingClientRect();
        const scrollableTop =
            scrollable === document.body
                ? 0
                : scrollable.getBoundingClientRect().top;
        return Stream.combine(
            $refRect,
            $scroll,
            $offset,
            $topMargin,
            (ref, [scrollX, scrollY], [offsetX, offsetY], topMargin) => {
                // console.log("[makeSticky, direction]", direction)
                // let x =
                //     direction === 'right'
                //         ? ref.right + gap
                //         : ref.left - gap - popperMetric.width
                // let y = Math.max(scrollableTop + topMargin, ref.top - scrollY)
                // let y = Math.max(scrollableTop + topMargin, 288 - scrollY)

                // 我们假定 topMargin 为 TOP_MARGIN (88), 方便固定 toc 在网页的位置
                let y = scrollableTop + TOP_MARGIN;
                let final_y = y + offsetY;
                // let y = Math.max((scrollableTop + TOP_MARGIN), 888 - scrollY)
                // let final_y = Math.max(TOP_MARGIN, offsetY + Math.max((scrollableTop + TOP_MARGIN), 288 - scrollY))
                // let final_y = Math.max(TOP_MARGIN, offsetY + Math.max((scrollableTop + TOP_MARGIN), 288 - scrollY))

                // 把 window.innerWidth 换成 window.outerWidth: 解决 safari 双指缩放导致 toc 居中遮挡网页内容的问题
                // popperMetric.width 是 toc 挂件的宽度
                // x = Math.min(Math.max(0, x), window.outerWidth - popperMetric.width) // restrict to visible area

                // 放在右侧
                // 我们假定 popperMetric.width 为 288, 方便固定 toc 在网页的位置
                // 我们假定用户都开启了Edge浏览器侧边栏, 所以往左多移 36
                // Octotree-style drawer is anchored to the left viewport edge.
                // The panel itself slides in/out using CSS, so page-specific drag offsets
                // must not shift it away from the edge.
                let final_x = 0;
                // The Octotree-style drawer is fixed to the right viewport edge.
                // Its small handle owns its own draggable vertical position.

                // console.log('[auto-toc, makeSticky, final_y]', Math.max((scrollableTop + TOP_MARGIN), 888 - scrollY), final_y)
                // console.log('[auto-toc, makeSticky, scrollableTop, topMargin]',scrollableTop, topMargin)
                // console.log('[auto-toc, makeSticky, window.outerWidth, popperMetric.width]',window.outerWidth, popperMetric.width)
                // console.log('[auto-toc, makeSticky, ref.right, gap]',ref.right, gap)
                // console.log('[auto-toc, makeSticky, x, window.outerWidth - popperMetric.width]', x, window.outerWidth - popperMetric.width)
                // console.log('[auto-toc, makeSticky, x, y, offsetX, offsetY]', x, y, offsetX, offsetY)
                // console.log('[auto-toc, makeSticky, scrollableTop, topMargin, ref.top, scrollY)', scrollableTop, topMargin, ref.top, scrollY)
                // // console.log('[auto-toc, makeSticky, scrollableTop + topMargin, ref.top - scrollY)', scrollableTop + topMargin, ref.top - scrollY)
                // console.log('[auto-toc, makeSticky, 3*(scrollableTop + TOP_MARGIN), 888 - scrollY', 3*(scrollableTop + TOP_MARGIN), 888 - scrollY)
                // console.log('[auto-toc, makeSticky, x + offsetX, y + offsetY]',x + offsetX, y + offsetY)
                // console.log('[auto-toc, makeSticky, ref.top, gap]',ref.top, gap)

                // if (shouldLog) console.log("[makeSticky,final_x, final_y]", final_x, final_y)
                return {
                    position: "fixed",
                    right: 0,
                    left: "auto",
                    top: 0,
                    // CSS keeps the drawer on the right edge; only the handle is vertically draggable.
                    transform: "none",
                };
            }
        );
    };

    const getOptimalContainerPos = function (article) {
        const { top, left, right, bottom, height, width } =
            article.getBoundingClientRect();

        const depthOf = function (elem) {
            let depth = 0;
            while (elem) {
                elem = elem.parentElement;
                depth++;
            }
            return depth;
        };
        const depthOfPoint = function ([x, y]) {
            const elem = document.elementFromPoint(x, y);
            return elem && depthOf(elem);
        };
        const gap = ARTICLE_TOC_GAP;
        const testWidth = 200;
        const testHeight = 400;
        const leftSlotTestPoints = [
            left - gap - testWidth,
            left - gap - testWidth / 2,
            left - gap,
        ]
            .map((x) =>
                [top, top + testHeight / 2, top + testHeight].map((y) => [x, y])
            )
            .reduce((prev, cur) => prev.concat(cur), []);
        const rightSlotTestPoints = [
            right + gap,
            right + gap + testWidth / 2,
            right + gap + testWidth,
        ]
            .map((x) =>
                [top, top + testHeight / 2, top + testHeight].map((y) => [x, y])
            )
            .reduce((prev, cur) => prev.concat(cur), []);
        const leftDepths = leftSlotTestPoints.map(depthOfPoint).filter(Boolean);
        const rightDepths = rightSlotTestPoints
            .map(depthOfPoint)
            .filter(Boolean);
        const leftAvgDepth = leftDepths.length
            ? leftDepths.reduce((a, b) => a + b, 0) / leftDepths.length
            : null;
        const rightAvgDepth = rightDepths.length
            ? rightDepths.reduce((a, b) => a + b, 0) / rightDepths.length
            : null;

        if (!leftAvgDepth) return { direction: "right" };
        if (!rightAvgDepth) return { direction: "left" };
        const spaceDiff = document.documentElement.offsetWidth - right - left;
        const scoreDiff =
            spaceDiff * 1 + (rightAvgDepth - leftAvgDepth) * 9 * -10 + 20; // I do like right better
        return scoreDiff > 0 ? { direction: "right" } : { direction: "left" };
    };

    const Container = function ({
        article,
        scrollable,
        $headings,
        theme,
        $activeHeading,
        $isShow,
        $userOffset,
        $relayout,
        $scroll,
        $topbarHeight,
        onClickHeading,
    }) {
        const handle = Handle();
        const toc = TOC({ $headings, $activeHeading, onClickHeading });
        return {
            oncreate({ dom }) {
                toc_dom = dom;
                const { direction } = getOptimalContainerPos(article);
                this.$style = makeSticky({
                    ref: article,
                    scrollable: scrollable,
                    popper: dom,
                    direction: direction,
                    gap: ARTICLE_TOC_GAP,
                    // $topMargin: $topbarHeight.map(h => (h || 0) + 50),
                    $topMargin: $topbarHeight.map((h) => TOP_MARGIN),
                    $refChange: $relayout,
                    $scroll: $scroll,
                    $offset: $userOffset,
                });
                this.$style.subscribe((_) => mithril.redraw());
            },
            view() {
                return mithril(
                    "#smarttoc.dark-scheme",
                    {
                        class: [
                            theme || "light",
                            "octotree-edge",
                            $headings().filter((h) => h.level <= 2).length >
                                50 && "lengthy",
                            $isShow() ? "" : "hidden",
                        ]
                            .filter(Boolean)
                            .join(" "),
                        style: this.$style && this.$style(),
                    },
                    [mithril(handle), mithril(toc)]
                );
            },
        };
    };

    const Extender = function ({ $headings, scrollable, $isShow, $relayout }) {
        const $extender = Stream();
        // toc: extend body height so we can scroll to the last heading
        let extender = document.createElement("DIV");
        extender.id = "smarttoc-extender";
        Stream.combine($isShow, $relayout, $headings, (isShow, _, headings) => {
            setTimeout(() => {
                // some delay to ensure page is stable ?
                let lastHeading = headings.slice(-1)[0].node;
                let lastRect = lastHeading.getBoundingClientRect();
                let extenderHeight = 0;
                if (scrollable === document.body) {
                    let heightBelowLastRect =
                        document.documentElement.scrollHeight -
                        (lastRect.bottom + document.documentElement.scrollTop) -
                        num(extender.style.height); // in case we are there already
                    extenderHeight = isShow
                        ? Math.max(
                              window.innerHeight -
                                  lastRect.height -
                                  heightBelowLastRect,
                              0
                          )
                        : 0;
                } else {
                    let scrollRect = scrollable.getBoundingClientRect();
                    let heightBelowLastRect =
                        scrollRect.top +
                        scrollable.scrollHeight -
                        getScroll(scrollable) - // bottom of scrollable relative to viewport
                        lastRect.bottom -
                        num(extender.style.height); // in case we are there already
                    extenderHeight = isShow
                        ? Math.max(
                              scrollRect.height -
                                  lastRect.height -
                                  heightBelowLastRect,
                              0
                          )
                        : 0;
                }
                $extender({
                    height: extenderHeight,
                });
            }, 300);
        });
        $extender.subscribe((style) => applyStyle(extender, style));
        return extender;
    };

    const relayoutStream = function (article, $resize, $isShow) {
        const readableStyle = function (article) {
            let computed = window.getComputedStyle(article);
            let fontSize = num(computed.fontSize);
            let bestWidth = Math.min(Math.max(fontSize, 12), 16) * 66;
            if (computed["box-sizing"] === "border-box") {
                bestWidth +=
                    num(computed["padding-left"]) +
                    num(computed["padding-right"]);
            }

            return Object.assign(
                num(computed.marginLeft) || num(computed.marginRight)
                    ? {}
                    : {
                          marginLeft: "auto",
                          marginRight: "auto",
                      },
                num(computed.maxWidth)
                    ? {}
                    : {
                          maxWidth: bestWidth,
                      }
            );
        };
        let oldStyle = article.style.cssText;
        let newStyle = readableStyle(article);
        let $relayout = $isShow.map((isShow) => {
            if (isShow) {
                // 注释掉了下面这两行, 免得生成 toc 的时候导致页面重排, 很丑
                // applyStyle(article, newStyle)
                // return article
            } else {
                // applyStyle(article, oldStyle)
            }
        });
        return Stream.combine($relayout, $resize, () => null);
    };

    const addAnchors = function (headings) {
        const anchoredHeadings = headings.map(function ({
            node,
            level,
            anchor,
        }) {
            if (!anchor) {
                anchor =
                    node.id ||
                    [].slice
                        .apply(node.children)
                        .filter((elem) => elem.tagName === "A")
                        .map((a) => {
                            let href = a.getAttribute("href") || "";
                            return href.startsWith("#") ? href.substr(1) : a.id;
                        })
                        .filter(Boolean)[0];
                if (!anchor) {
                    anchor = node.id = unique(safe(node.textContent));
                } else {
                    anchor = unique(anchor);
                }
            }
            return { node, level, anchor };
        });

        // console.log("anchoredHeadings begin aaa")
        // console.log(anchoredHeadings)
        // console.log("anchoredHeadings end bbb")
        return anchoredHeadings;
    };

    const getScrollParent = function (elem) {
        const canScroll = (el) =>
            ["auto", "scroll"].includes(
                window.getComputedStyle(el).overflowY
            ) && el.clientHeight + 1 < el.scrollHeight;
        while (elem && elem !== document.body && !canScroll(elem)) {
            elem = elem.parentElement;
        }
        log("scrollable", elem);
        draw(elem, "purple");
        return elem;
    };

    const scrollStream = function (scrollable, $isShow) {
        let $scroll = Stream([
            getScroll(scrollable, "left"),
            getScroll(scrollable),
        ]);
        let source = scrollable === document.body ? window : scrollable;
        Stream.fromEvent(source, "scroll")
            .filter(() => $isShow())
            .throttle()
            .subscribe(() => {
                $scroll([getScroll(scrollable, "left"), getScroll(scrollable)]);
            });
        return $scroll;
    };

    const activeHeadingStream = function (
        $headings,
        scrollable,
        $scroll,
        $relayout,
        $topbarHeight
    ) {
        const $headingScrollYs = Stream.combine(
            $relayout,
            $headings,
            (_, headings) => {
                const scrollableTop =
                    (scrollable === document.body
                        ? 0
                        : scrollable.getBoundingClientRect().top) -
                    getScroll(scrollable, "top");
                return headings.map(
                    ({ node }) =>
                        node.getBoundingClientRect().top - scrollableTop
                );
            }
        );

        let $curIndex = Stream.combine(
            $headingScrollYs,
            $scroll,
            $topbarHeight,
            function (headingScrollYs, [scrollX, scrollY], topbarHeight = 0) {
                let i = 0;
                for (let len = headingScrollYs.length; i < len; i++) {
                    if (headingScrollYs[i] > scrollY + topbarHeight + 20) {
                        break;
                    }
                }
                return Math.max(0, i - 1);
            }
        );

        return $curIndex.unique();
    };

    const scrollToHeading = function (
        { node },
        scrollElem,
        onScrollEnd,
        topMargin = 0
    ) {
        scrollTo({
            targetElem: node,
            scrollElem: scrollElem,
            topMargin: topMargin,
            maxDuration: 566,
            callback: onScrollEnd && onScrollEnd.bind(null, node),
        });
    };

    const getTopBarHeight = function (topElem) {
        // 默认网页的顶部有个 bar, 而且默认这个 bar 的高度是 88, 保证点击 toc 的时候跳转可以网页多往下移一点, 免得被各种检测不出来的 bar 挡住
        return TOP_MARGIN;

        const findFixedParent = function (elem) {
            const isFixed = (elem) => {
                let { position, zIndex } = window.getComputedStyle(elem);
                return position === "fixed" && zIndex;
            };
            while (elem !== document.body && !isFixed(elem)) {
                elem = elem.parentElement;
            }
            return elem === document.body ? null : elem;
        };
        let { left, right, top } = topElem.getBoundingClientRect();
        let leftTopmost = document.elementFromPoint(left + 1, top + 1);
        let rightTopmost = document.elementFromPoint(right - 1, top + 1);
        if (
            leftTopmost &&
            rightTopmost &&
            leftTopmost !== topElem &&
            rightTopmost !== topElem
        ) {
            let leftFixed = findFixedParent(leftTopmost);
            let rightFixed = findFixedParent(rightTopmost);
            if (leftFixed && leftFixed === rightFixed) {
                return leftFixed.offsetHeight;
            } else {
                return 0;
            }
        } else {
            return 0;
        }
    };

    const getTheme = function (article) {
        let elem = article;
        try {
            const parseColor = (str) =>
                str
                    .replace(/rgba?\(/, "")
                    .replace(/\).*/, "")
                    .split(/, ?/);
            const getBgColor = (elem) =>
                parseColor(window.getComputedStyle(elem)["background-color"]);
            const isTransparent = ([r, g, b, a]) => a === 0;
            const isLight = ([r, g, b, a]) => r + g + b > (255 / 2) * 3;
            while (elem && elem.parentElement) {
                const color = getBgColor(elem);
                if (isTransparent(color)) {
                    elem = elem.parentElement;
                } else {
                    return isLight(color) ? "light" : "dark";
                }
            }
            return "light";
        } catch (e) {
            return "light";
        }
    };

    const getRoot = function () {
        let root = document.getElementById("smarttoc_wrapper");
        if (!root) {
            root = document.body.appendChild(document.createElement("DIV"));
            root.id = "smarttoc_wrapper";
        }
        return root;
    };

    // 生成目录
    function createTOC({
        article,
        $headings: $headings_,
        userOffset = [0, 0],
    }) {
        var domain2width2offset = GM_getValue(
            "menu_GAEEScript_auto_toc_domain_2_width_2_offset"
        );
        if (domain2width2offset[window.location.host] != null) {
            var lastOffset = domain2width2offset[window.location.host][window.innerWidth];
            if (shouldLog) console.log("[auto-toc, lastOffset]", lastOffset);
            if (shouldLog) console.log("[auto-toc, domain2width2offset[" + window.location.host + "]]", domain2width2offset[window.location.host]);
            if (lastOffset != null) {
                userOffset = lastOffset;
            }
            // console.log("[auto-toc, init userOffset]", userOffset);
        }

        const $headings = $headings_.map(addAnchors);
        insertCSS(getTocCss(), "smarttoc__css");

        const scrollable = getScrollParent(article);
        const theme = getTheme(article);
        log("theme", theme);

        const $isShow = Stream(true);
        const $topbarHeight = Stream();
        const $resize = Stream.combine(
            Stream.fromEvent(window, "resize"),
            Stream.fromEvent(document, "readystatechange"),
            Stream.fromEvent(document, "load"),
            Stream.fromEvent(document, "DOMContentLoaded"),
            () => null
        )
            .filter(() => $isShow())
            .throttle();
        const $scroll = scrollStream(scrollable, $isShow);
        const $relayout = relayoutStream(article, $resize, $isShow);
        const $activeHeading = activeHeadingStream(
            $headings,
            scrollable,
            $scroll,
            $relayout,
            $topbarHeight
        );
        const $userOffset = Stream(userOffset);

        // scrollable.appendChild(
        //   Extender({ $headings, scrollable, $isShow, $relayout })
        // )

        const onScrollEnd = function (node) {
            if ($topbarHeight() == null) {
                setTimeout(() => {
                    $topbarHeight(getTopBarHeight(node));
                    log("topBarHeight", $topbarHeight());
                    if ($topbarHeight()) {
                        scrollToHeading(
                            { node },
                            scrollable,
                            null,
                            $topbarHeight() + 10
                        );
                    }
                }, 300);
            }
        };

        const onClickHeading = function (e) {
            e.redraw = false;
            e.preventDefault();
            e.stopPropagation();
            const clickedLink = e.target && e.target.closest
                ? e.target.closest("a[href^='#']")
                : null;
            const temp = clickedLink ? clickedLink.getAttribute("href") : e.target.getAttribute("href");
            if (!temp || temp === "#") return;
            const anchor = temp.substr(1);
            const heading = $headings().find(
                (heading) => heading.anchor === anchor
            );
            scrollToHeading(
                heading,
                scrollable,
                onScrollEnd,
                ($topbarHeight() || 0) + 10
            );
        };

        mithril.mount(
            getRoot(),
            Container({
                article,
                scrollable,
                $headings,
                theme,
                $activeHeading,
                $isShow,
                $userOffset,
                $relayout,
                $scroll,
                $topbarHeight,
                onClickHeading,
            })
        );

        // // now show what we've found
        // if (article.getBoundingClientRect().top > window.innerHeight - 50) {
        //     scrollToHeading(
        //         $headings()[0],
        //         scrollable,
        //         onScrollEnd,
        //         ($topbarHeight() || 0) + 10
        //     );
        // }

        return {
            isValid: () =>
                document.body.contains(article) &&
                article.contains($headings()[0].node),

            isShow: () => $isShow(),

            toggle: () => $isShow(!$isShow()),

            next: () => {
                if ($isShow()) {
                    let nextIdx = Math.min(
                        $headings().length - 1,
                        $activeHeading() + 1
                    );
                    scrollToHeading(
                        $headings()[nextIdx],
                        scrollable,
                        onScrollEnd,
                        ($topbarHeight() || 0) + 10
                    );
                }
            },

            prev: () => {
                if ($isShow()) {
                    let prevIdx = Math.max(0, $activeHeading() - 1);
                    scrollToHeading(
                        $headings()[prevIdx],
                        scrollable,
                        onScrollEnd,
                        ($topbarHeight() || 0) + 10
                    );
                }
            },

            dispose: () => {
                $isShow(false);
                mithril.render(getRoot(), mithril(""));
                return { userOffset: $userOffset() };
            },
        };
    }

    const pathToTop = function (elem, maxLvl = -1) {
        assert(elem, "no element given");
        const path = [];
        while (elem && maxLvl--) {
            path.push(elem);
            elem = elem.parentElement;
        }
        return path;
    };

    //////////////////////////////// 以下是新版提取文章和标题的部分(目前测出某些网站会导致页面排版错乱比如谷歌和https://www.163.com/dy/article/GJKFUO4105119NPR.html) //////////////////////////////////////////////////////////////////////
    //////////////////////////////// 所以退回后面的旧版的代码了 //////////////////////////////////////////////////////////////////////

    var toArray = function (arr) {
        return [].slice.apply(arr);
    };

    const header_tags = ["H1", "H2", "H3", "H4", "H5", "H6"];
    const extra_tags = ["STRONG", "B"];

    // 判断一个元素是否对于整个页面水平居中
    const isElementHorizontalCentered = function (element) {
        let divElement = element.closest("div");
        if (divElement) {
            let finalElem = element;
            let closestSection = element.closest("section");
            let OtherExtraTagsElemCombinedText = "";
            // 如果有个最近的section祖先, 则检查是否有兄弟section, 然后判断他们的共同祖先section是否居中
            if (closestSection) {
                if (shouldLog)
                    console.log(
                        "isElementHorizontalCentered closestSection begin",
                        element.textContent
                    );
                finalElem = closestSection;
                // 拿到一个高层的祖先<section>元素 S 并且它是有个其他包含其他文本的section, 且途中不能有为P的祖先, 用 S 当做 finalElem 来判断是否居中
                let currentElement = element;
                let previousSibling = null;
                let nextSibling = null;
                while (currentElement.parentElement) {
                    let curParent = currentElement.parentElement;
                    if (curParent.isCalcedCentered) {
                        // 已经被标记过了, 那应该直接返回 false 了
                        return false;
                    }
                    if (curParent.tagName === "SECTION") {
                        previousSibling = curParent.previousElementSibling;
                        nextSibling = curParent.nextElementSibling;
                        // 如果祖先的兄弟已经是<p>了, 那可以停止继续循环了
                        if (
                            (previousSibling &&
                                previousSibling.tagName === "P") ||
                            (nextSibling && nextSibling.tagName === "P")
                        ) {
                            finalElem = curParent;
                            break;
                        }
                        let hasExtraTagsTextCnt = 0;
                        let shouldBreakWhile = false;
                        OtherExtraTagsElemCombinedText = "";
                        for (let k = 0; k < curParent.childNodes.length; k++) {
                            let fc = curParent.childNodes[k];
                            // 如果当前祖先的子元素已经是有<p>子元素了, 那可以停止继续循环了, 并且把 `自己` 当做 finalElem
                            if (fc.querySelector("p") !== null) {
                                finalElem = currentElement;
                                shouldBreakWhile = true;
                                break;
                            }
                            // 如果当前祖先的子元素已经是2个以及以上的extra_tags文本子元素了, 那可以停止继续循环了, 并且把 `当前祖先` 当做 finalElem
                            for (let i = 0; i < extra_tags.length; i++) {
                                let curElems = fc.querySelectorAll(
                                    extra_tags[i]
                                );
                                if (curElems) {
                                    for (let j = 0; j < curElems.length; j++) {
                                        let curElem = curElems[j];
                                        if (curElem.textContent != "") {
                                            hasExtraTagsTextCnt += 1;
                                            OtherExtraTagsElemCombinedText +=
                                                curElem.textContent;
                                            if (shouldLog)
                                                console.log(
                                                    "isElementHorizontalCentered OtherExtraTagsElemCombinedText",
                                                    element.textContent,
                                                    OtherExtraTagsElemCombinedText,
                                                    fc,
                                                    curElem
                                                );
                                            if (hasExtraTagsTextCnt == 2) {
                                                finalElem = curParent;
                                                shouldBreakWhile = true;
                                            }
                                        }
                                    }
                                }
                            }
                        }
                        if (shouldBreakWhile) {
                            break;
                        }
                    } else if (curParent.tagName === "P") {
                        // 如果中间有一个祖先是P那就不应该要了
                        break;
                    } else if (curParent.tagName === "div") {
                        // 如果中间有一个祖先是div那就不应该要了
                        break;
                    }
                    currentElement = currentElement.parentElement;
                }
                finalElem.isCalcedCentered = true;
                if (shouldLog)
                    console.log(
                        "isElementHorizontalCentered closestSection end",
                        element.textContent,
                        OtherExtraTagsElemCombinedText,
                        finalElem
                    );
            }
            let elementWidth = finalElem.offsetWidth;
            let pWidth = divElement.offsetWidth;
            let elementLeft = finalElem.getBoundingClientRect().left;
            let pLeft = divElement.getBoundingClientRect().left;
            let elementCenter = elementLeft + elementWidth / 2;
            let pCenter = pLeft + pWidth / 2;
            let isCentered = Math.abs(elementCenter - pCenter) <= 3;

            if (shouldLog)
                console.log(
                    "isElementHorizontalCentered isCentered: ",
                    element.textContent,
                    isCentered,
                    elementCenter,
                    pCenter
                );

            // 如果有兄弟section, 然后判断他们是不是类似于 `01`+ `起源`这种一个是纯数字其他是文字的几个section合起来的大section, 那就把他们的文本合并来当做`01`这个section的标题 newTextContent
            if (isCentered && OtherExtraTagsElemCombinedText != "") {
                element.newTextContent = OtherExtraTagsElemCombinedText;
                if (shouldLog)
                    console.log(
                        "isElementHorizontalCentered shouldCombineSectionText: ",
                        element.textContent,
                        element.newTextContent
                    );
            }

            return isCentered;
        } else {
            let elementRect = element.getBoundingClientRect();
            let viewportWidth =
                window.innerWidth || document.documentElement.clientWidth;
            let elementCenterX = elementRect.left + elementRect.width / 2;
            return Math.abs(elementCenterX - viewportWidth / 2) < 8;
        }
    };

    // 拿到离页面左边边缘最近的标题的距离
    var getElemsCommonLeft = function (elems) {
        if (!elems.length) {
            if (shouldLog)
                console.log("calc_getElemsCommonLeft, !elems.length");
            return undefined;
        }
        var lefts = {};
        elems.forEach(function (el) {
            var left = el.getBoundingClientRect().left;
            if (!lefts[left]) {
                lefts[left] = 0;
            }
            lefts[left]++;
        });
        var count = elems.length;
        var isAligned = Object.keys(lefts).length <= Math.ceil(0.6 * count);
        if (!isAligned) {
            if (shouldLog)
                console.log(
                    "calc_getElemsCommonLeft, !isAligned, ",
                    Object.keys(lefts).length,
                    Math.ceil(0.6 * count),
                    count
                );
            return undefined;
        }
        var sortedByCount = Object.keys(lefts).sort(function (a, b) {
            return lefts[b] - lefts[a];
        });
        var most = Number(sortedByCount[0]);
        if (shouldLog) console.log("calc_getElemsCommonLeft, most, ", most);
        return most;
    };

    const extractArticle = function (rootElement = document) {
        // if (shouldLog) console.log("extracting article");

        const scores = new Map();

        function addScore(elem, inc) {
            scores.set(elem, (scores.get(elem) || 0) + inc);
        }

        function updateScore(elem, weight) {
            let path = pathToTop(elem, weight.length);
            path.forEach((elem, distance) => addScore(elem, weight[distance]));
        }

        // weigh nodes by factor: "selector", "distance from this node"
        const weights = {
            h1: [0, 100, 60, 40, 30, 25, 22].map((s) => s * 0.4),
            h2: [0, 100, 60, 40, 30, 25, 22],
            h3: [0, 100, 60, 40, 30, 25, 22].map((s) => s * 0.5),
            h4: [0, 100, 60, 40, 30, 25, 22].map((s) => s * 0.5 * 0.5),
            h5: [0, 100, 60, 40, 30, 25, 22].map((s) => s * 0.5 * 0.5 * 0.5),
            h6: [0, 100, 60, 40, 30, 25, 22].map(
                (s) => s * 0.5 * 0.5 * 0.5 * 0.5
            ),
            article: [500],
            ".article": [500],
            ".content": [101],
            sidebar: [-500],
            ".sidebar": [-500],
            aside: [-500],
            ".aside": [-500],
            nav: [-500],
            ".nav": [-500],
            ".navigation": [-500],
            ".toc": [-500],
            ".table-of-contents": [-500],
        };
        const selectors = Object.keys(weights);
        selectors
            .map((selector) => ({
                selector: selector,
                elems: [].slice.apply(rootElement.querySelectorAll(selector)),
            }))
            .forEach(({ selector, elems }) =>
                elems.forEach((elem) => updateScore(elem, weights[selector]))
            );
        const sorted = [...scores].sort((a, b) => b[1] - a[1]);

        // reweigh top 5 nodes by factor:  "take-lots-vertical-space", "contain-less-links", "too-narrow"
        let candicates = sorted
            .slice(0, 5)
            .filter(Boolean)
            .map(([elem, score]) => ({ elem, score }));

        let isTooNarrow = (e) => e.scrollWidth < 400; // rule out sidebars

        candicates.forEach((c) => {
            if (isTooNarrow(c.elem)) {
                c.isNarrow = true;
                candicates.forEach((parent) => {
                    if (parent.elem.contains(c.elem)) {
                        parent.score *= 0.7;
                    }
                });
            }
        });
        candicates = candicates.filter((c) => !c.isNarrow);

        const reweighted = candicates
            .map(({ elem, score }) => [
                elem,
                score *
                    Math.log(
                        (elem.scrollHeight * elem.scrollHeight) /
                            (elem.querySelectorAll("a").length || 1)
                    ),
                elem.scrollHeight,
                elem.querySelectorAll("a").length,
            ])
            .sort((a, b) => b[1] - a[1]);

        const article = reweighted.length ? reweighted[0][0] : null;

        // console.log('[extracttttttttttt]', {
        //     scores: scores,
        //     sorted: sorted,
        //     candicates: candicates,
        //     reweighted: reweighted
        // });
        return article;
    };

    const extractHeadings = function (article) {
        if (shouldLog) console.log("extractHeadings begin");
        const tags = header_tags.concat(extra_tags);
        // const tagWeight = (tag) =>
        //     ({ H1: 4, H2: 9, H3: 9, H4: 10, H5: 10, H6: 10, STRONG: 10, B: 10 }[
        //         tag
        //     ]);
        const isVisible = (elem) => elem.offsetHeight !== 0;

        // 筛选页面上想要遍历的 node
        const acceptNode = (node) =>
            tags.includes(node.tagName) && isVisible(node)
                ? // isVisible(node) &&
                  // (node.id ? finalId.includes(node.id) : finalInnerHTML.includes(node.innerHTML))
                  NodeFilter.FILTER_ACCEPT
                : NodeFilter.FILTER_SKIP;
        const treeWalker = document.createTreeWalker(
            article,
            NodeFilter.SHOW_ELEMENT,
            { acceptNode }
        );

        // console.log("extra_tags_leftmost_offset old begin")
        // console.log(extra_tags_leftmost_offset)
        // console.log("extra_tags_leftmost_offset old end")

        let isNormalHeadingExist = false;
        let normalHeadingCnt = 0;
        for (let i = 0; i < header_tags.length; i++) {
            // 检查 article 是否包含 tag 标签
            let tag = header_tags[i];
            const elems = (0, toArray)(article.getElementsByTagName(tag));
            normalHeadingCnt += elems.length;
            if (normalHeadingCnt >= 3) {
                // 3个及以上比较好, 免得有可能其中一个是文章最上面的大标题
                isNormalHeadingExist = true;
                break;
            }
        }

        let extra_tags_leftmost_offset = new Map();
        if (!isNormalHeadingExist) {
            // 有几个其他正经标题了, 之后没必要提取<b>和<strong>了
            // 提前计算出<b> 和<strong>这俩特殊标题的离页面左边边缘最近的标题的距离
            extra_tags.forEach((tag) => {
                if (shouldLog)
                    console.log("calc_getElemsCommonLeft, tagName=", tag);
                const elems = (0, toArray)(article.getElementsByTagName(tag));
                extra_tags_leftmost_offset[tag] = getElemsCommonLeft(elems);
            });
        }
        // 返回level
        const is_b_strong_valid_heading = function (node) {
            // 有几个其他正经标题了, 不要提取<b>和<strong>了
            if (isNormalHeadingExist) {
                if (shouldLog)
                    console.log("b_strong continue 0, ", node.textContent);
                return 0;
            }
            // 加粗的文字的前后还有其他元素(有可能是普通不加粗的文字或者图片啊啥的)则不识别为标题
            if (
                node.closest("P") ||
                node.parentElement.childNodes.length !== 1
            ) {
                let cn_list = [];
                // 拿到最近的p祖先的子元素们
                if (node.closest("P")) {
                    cn_list.push(node.closest("P").childNodes);
                }
                // 拿到父元素的子元素们
                if (node.parentElement.childNodes.length !== 1) {
                    cn_list.push(node.parentElement.childNodes);
                }
                for (let j = 0; j < cn_list.length; j++) {
                    let cn = cn_list[j];
                    for (let i = 0; i < cn.length; i++) {
                        if (
                            cn[i] === node ||
                            cn[i].contains(node) ||
                            extra_tags.includes(cn[i].tagName) ||
                            cn[i].nodeName.toLowerCase() === "br" ||
                            (cn[i].nodeName.toLowerCase() === "span" &&
                                cn[i].textContent === "")
                        ) {
                            // 但是同级元素是换行<br>或空的<span>或者是<b>或<strong>是可以的
                            continue;
                        }
                        if (shouldLog)
                            console.log(
                                "b_strong continue 8, ",
                                cn[i].textContent,
                                cn[i].nodeName.toLowerCase()
                            );
                        return 0;
                    }
                }
            }

            // 当前 elem 不能是标题的子元素, 否则会重复
            for (let j = 0; j < tags.length; j++) {
                let curNode =
                    node.tagName == tags[j] ? node.parentElement : node; // 不这样的话, closest会找到node自己
                const ancestor = curNode.closest(tags[j]);
                if (ancestor) {
                    if (shouldLog)
                        console.log(
                            "b_strong continue 2, ",
                            node.textContent,
                            ancestor
                        );
                    return 0;
                }
            }

            // 加粗的文字的父元素以及爷元素为<u>则不识别为标题(因为<u>会使得子元素带下划线)
            if (
                node.parentElement &&
                (node.parentElement.tagName === "U" ||
                    (node.parentElement.parentElement &&
                        node.parentElement.parentElement.tagName === "U"))
            ) {
                if (shouldLog)
                    console.log("b_strong continue 5, ", node.textContent);
                return 0;
            }
            let cur_leftmost_offset = extra_tags_leftmost_offset[node.tagName];
            let isCentered = false;
            let isLeftAligned = false;
            // strong/b 粗体字类型的标题靠左对齐则level为2, 不靠左对齐则看看是否居中, 居中则level为1; 总之: 优先查看是否靠左对齐
            if (!cur_leftmost_offset) {
                isCentered = isElementHorizontalCentered(node);
                if (isCentered) {
                    return 1;
                }
                if (!isCentered) {
                    if (shouldLog)
                        console.log("b_strong continue 6, ", node.textContent);
                    return 0;
                }
            } else {
                // 当前 elem 离左边距离得和 cur_leftmost_offset 一样
                isLeftAligned =
                    node.getBoundingClientRect().left === cur_leftmost_offset;
                if (isLeftAligned) {
                    return 2;
                }
                isCentered = isElementHorizontalCentered(node);
                if (isCentered) {
                    return 1;
                }
                if (!isCentered && !isLeftAligned) {
                    if (shouldLog)
                        console.log("b_strong continue 1, ", node.textContent);
                    return 0;
                }
            }
        };

        const headings = [];
        while (treeWalker.nextNode()) {
            // 按照页面上的显示顺序遍历
            let node = treeWalker.currentNode;
            if (node.autoTocHeadingLevel == null) {
                // 如果当前标题内容为空, 则找相邻的下一个同级的非header_tags以及非可用的b/strong的元素用它的文本作为标题显示, 但如果还是空白的, 那就不要了
                let nodeText = node.textContent.trim();
                if (
                    nodeText === "" &&
                    node.nextElementSibling &&
                    !header_tags.includes(node.nextElementSibling.tagName) &&
                    !is_b_strong_valid_heading(node)
                ) {
                    nodeText = node.nextElementSibling.textContent.trim();
                }
                if (nodeText === "") {
                    if (shouldLog)
                        console.log("b_strong continue 4", node.textContent);
                    node.autoTocHeadingLevel = 0;
                    continue;
                }
                let cur_level = tags.indexOf(node.tagName) + 1;
                if (extra_tags.includes(node.tagName)) {
                    cur_level = is_b_strong_valid_heading(node);
                    if (cur_level === 0) {
                        node.autoTocHeadingLevel = 0;
                        continue;
                    }
                    if (shouldLog)
                        console.log(
                            "b_strong cur_level",
                            node.textContent,
                            cur_level
                        );
                }
                node.autoTocHeadingLevel = cur_level;
            }

            if (node.autoTocHeadingLevel < 1) {
                continue;
            }
            headings.push({
                node,
                level: node.autoTocHeadingLevel,
            });
        }

        if (shouldLog) console.log("extractHeadings end", headings);
        return headings;
    };

    ////////////////////////////////////////////////////////////////////////////////

    function extract() {
        const article = extractArticle(document);
        let $headings;
        if (article) {
            $headings = Stream(extractHeadings(article));

            // const $articleChange = Stream(null);
            // const observer = new MutationObserver((_) => $articleChange(null));
            // observer.observe(article, { childList: true });
            //
            // $articleChange.throttle(200).subscribe((_) => {
            //     if (shouldLog) console.log("extract $articleChange");
            //     let headings = extractHeadings(article);
            //     if (headings && headings.length) {
            //         $headings(headings);
            //     }
            // });
        }

        return [article, $headings];
    }

    ////////////////////////////////

    let toc;
    let autoGenTocTimerId;
    let checkBrowserWidthChangeTimerId;

    const doGenerateToc = function (option = {}) {
        let [article, $headings] = extract();
        if (article && $headings && $headings().length) {
            // console.log("createTOC before old begin aaa");
            // console.log($headings());
            // console.log("createTOC before old end bbb");

            return createTOC(Object.assign({ article, $headings }, option));
        } else {
            return null;
        }
    };

    function handleToc() {
        var domain2shouldShow = GM_getValue("menu_GAEEScript_auto_open_toc");
        if (shouldLog) console.log("[auto_toc] - handleToc domain2shouldShow: ", domain2shouldShow);
        if (autoGenTocTimerId) {
            clearInterval(autoGenTocTimerId);
        }
        if (checkBrowserWidthChangeTimerId) {
            clearInterval(checkBrowserWidthChangeTimerId);
        }
        if (domain2shouldShow[window.location.host]) {
            autoGenTocTimerId = setInterval(() => {
                if (toc && toc.isValid()) {
                    // clearInterval(timerId); 如果不注释的话, 就会终止这个 timer 从而导致在页面未刷新但是标题改变的时候无法自动生成最新的标题
                    // return;
                }
                if (!domain2shouldShow[window.location.host]) {
                    // 防止正在循环尝试生成 toc 的时候用户关闭了 toc 开关
                    return;
                }
                if (toc && !toc.isValid()) {
                    if (shouldLog)
                        console.log(
                            "[auto_toc] - handleToc regen toc window.location.host, toc && !toc.isValid()",
                            window.location.host
                        );
                    let lastState = toc.dispose();
                    toc = doGenerateToc(lastState);
                } else if (toc == null) {
                    if (shouldLog)
                        console.log(
                            "[auto_toc] - handleToc regen toc window.location.host, toc == null",
                            window.location.host
                        );
                    toc = doGenerateToc();
                }
            }, 1600);
        }

        if (domain2shouldShow[window.location.host]) {
            toc = doGenerateToc();
            // console.log("[handleToc toc]", toc);
            // 如果生成的toc有问题或者toc没生成出来, 那就 n 秒之后再生成一次(比如掘金的很多文章得过几秒钟再生成才行)
            // toast('Will generate TOC in 3.8 seconds ...', 1600);
            setTimeout(() => {
                if ((toc && !toc.isValid()) || toc == null) {
                    toast("No article/headings are detected.");
                }
            }, 3800);

            // A watcher to browser width changes on the display.
            checkBrowserWidthChangeTimerId = setInterval(checkBrowserWidthChange, 2800);
        } else {
            if (shouldLog) console.log("[auto_toc] - handleToc should not show.");
            if (toc) {
                toc.dispose();
            }
        }
    }

    //////////////////////////////////////// A watcher to browser width changes on the display.
    let lastBrowserWidth = window.innerWidth;
    function checkBrowserWidthChange() {
        if (Date.now() - last_move_ts < 6666) {  // if we just moved auto-toc, it usually means we wanna do some actions, so we skip this check
            return;
        }
        // console.log("[auto_toc] - window.innerWidth = " + window.innerWidth);
        // console.log("[auto_toc] - lastBrowserWidth = " + lastBrowserWidth);
        if (window.innerWidth - lastBrowserWidth > 300 || lastBrowserWidth - window.innerWidth > 300) {
            toast("window.innerWidth changed.");
            if (shouldLog) console.log("[auto_toc] - window.innerWidth changed.");
            lastBrowserWidth = window.innerWidth;
            handleToc();
        }
    }

    //////////////////////////////////////// 所有网站-缩小图片
    function shrinkImg(from_menu_switch = false) {
        var domain2shouldShrinkImg = GM_getValue("menu_GAEEScript_shrink_img");
        var shouldShrinkImg = domain2shouldShrinkImg[window.location.host];
        // console.log(
        //     "[shrinkImg] begin"
        // );
        let shouldNotShrink = shouldShrinkImg == null || !shouldShrinkImg;
        if (!from_menu_switch && shouldNotShrink) {
            return;
        }
        let cssTxt = "";
        const shrinkWidth = "88";
        const shrinkWidthStr = shrinkWidth + "px";
        Array.from(document.getElementsByTagName("*")).forEach((ele) => {
            if (ele.tagName === "IMG" && !ele.closest("header")) {
                if (shouldNotShrink) {
                    ele.style.width = ele.style.originalWidth;
                    // ele.style.height = ele.style.originalHeight;
                    ele.style.maxHeight = ele.style.originalMaxHeight;
                    ele.style.minHeight = ele.style.originalMinHeight;
                    ele.style.maxWidth = ele.style.originalMaxWidth;
                    ele.style.minWidth = ele.style.originalMinWidth;
                    ele.style.transition = "";
                } else {
                    if (ele.width > shrinkWidth) {
                        // 防止多次缩小同一个图片, 也防止放大本身就很小的图片
                        const genCSSSelector = (ele) => {
                            if (ele.id) return `img[id="${ele.id}"]:hover`;
                            else {
                                // if(ele.src.startsWith('data:')) return `img[src="${ele.src}"]:hover`;//base64的src
                                if (ele.src.startsWith("data:"))
                                    return ""; //base64的src
                                else {
                                    const the_src =
                                        ele.src ||
                                        ele.getAttribute("_src") ||
                                        "找不到可用选择器";
                                    //http的src
                                    try {
                                        const url = new URL(the_src); //_src是一些网站懒加载的
                                        return `img[src="${
                                            url.pathname + url.search
                                        }"]:hover,img[src="${the_src}"]:hover`;
                                    } catch (e) {
                                        console.log(
                                            "[shrinkImg] ERROR: " + e.message
                                        );
                                        return "";
                                    }
                                }
                            }
                        };
                        let cssSelectorStr = genCSSSelector(ele);
                        if (cssSelectorStr != "") {
                            if (!ele.style.originalWidth || from_menu_switch) {
                                // 防止不是打开开关导致的多次缩小同一个图片
                                ele.style.originalWidth = ele.width + "px";
                                // ele.style.originalHeight = ele.height + "px";  // 不记录这个了, 时不时拿到的是0
                                ele.style.originalMaxHeight =
                                    ele.style.maxHeight;
                                ele.style.originalMinHeight =
                                    ele.style.minHeight;
                                ele.style.originalMaxWidth = ele.style.maxWidth;
                                ele.style.originalMinWidth = ele.style.minWidth;
                                ele.style.cssSelectorStr = cssSelectorStr;

                                // // 加这个div的原因: 为了解决当img缩小之后导致标题间隔变化, toc 跳转会不准(注释了是因为会导致单击了知乎的图片之后缩小的时候知乎网页崩溃)
                                // let parent = document.createElement('div');//  新建父元素
                                // ele.parentNode.replaceChild(parent,ele);//  获取子元素原来的父元素并将新父元素代替子元素
                                // parent.appendChild(ele);//  在新父元素下添加原来的子元素
                                // // 设置新div元素的样式
                                // parent.style.display = "flex";
                                // parent.style.alignItems = "center";
                                // parent.style.width = ele.width + "px";
                                // parent.style.height = ele.height + "px";

                                cssTxt +=
                                    cssSelectorStr +
                                    `{` +
                                    // `width:${ele.width}px !important;height:${ele.height}px !important;` +
                                    `width:${ele.width}px !important;height:auto !important;` +
                                    // `width:${ele.width}px !important;` +
                                    `}`;
                                ele.style.width = shrinkWidthStr;
                                ele.style.height = "auto";
                                ele.style.maxHeight = "";
                                ele.style.minHeight = "";
                                ele.style.maxWidth = "";
                                ele.style.minWidth = "";
                                ele.style.transition = isSafari()
                                    ? "width 0.2s ease, height 0.2s ease"
                                    : "width 0.3s linear(0 0%, 0 1.8%, 0.01 3.6%, 0.03 6.35%, 0.07 9.1%, 0.13 11.4%, 0.19 13.4%, 0.27 15%, 0.34 16.1%, 0.54 18.35%, 0.66 20.6%, 0.72 22.4%, 0.77 24.6%, 0.81 27.3%, 0.85 30.4%, 0.88 35.1%, 0.92 40.6%, 0.94 47.2%, 0.96 55%, 0.98 64%, 0.99 74.4%, 1 86.4%, 1 100%) 0s, height 0.3s linear(0 0%, 0 1.8%, 0.01 3.6%, 0.03 6.35%, 0.07 9.1%, 0.13 11.4%, 0.19 13.4%, 0.27 15%, 0.34 16.1%, 0.54 18.35%, 0.66 20.6%, 0.72 22.4%, 0.77 24.6%, 0.81 27.3%, 0.85 30.4%, 0.88 35.1%, 0.92 40.6%, 0.94 47.2%, 0.96 55%, 0.98 64%, 0.99 74.4%, 1 86.4%, 1 100%) 0s";
                            }
                        }
                    }
                }
            }
        });

        if (shouldNotShrink) {
            removeCSS("shrinkimg__css");
            setTimeout(handleToc, 600); // 重新生成toc的原因: 为了解决当img恢复 放大 之后导致标题间隔变化, toc 跳转会不准
        } else {
            if (cssTxt != "") {
                insertCSS(cssTxt, "shrinkimg__css");
                setTimeout(handleToc, 600); // 重新生成toc的原因: 为了解决当img 缩小 之后导致标题间隔变化, toc 跳转会不准
            }
            setTimeout(shrinkImg, 800);
        }
        // console.log(
        //     "[shrinkImg] end"
        // );
    }

    var menu_ALL = [
            [
                "menu_GAEEScript_auto_open_toc",
                "Enable TOC On Current Site(当前网站TOC开关)",
                {},
            ],
            [
                "menu_GAEEScript_auto_collapse_toc",
                "Collapse TOC on current site(当前网站TOC自动折叠开关)",
                {},
            ],
            [
                "menu_GAEEScript_shrink_img",
                "Touch Fish On Current Site(当前网站摸鱼开关)",
                {},
            ],
        ],
        menu_ID = [];

    function handleMenu() {
        // console.log("")
        for (let i = 0; i < menu_ALL.length; i++) {
            // 如果读取到的值为 null 就写入默认值
            // console.log("debug ssss")
            if (GM_getValue(menu_ALL[i][0]) == null) {
                // console.log("debug ssss 11")
                GM_setValue(menu_ALL[i][0], menu_ALL[i][2]);
            }
        }
        registerMenuCommand();
    }

    // 注册脚本菜单
    function registerMenuCommand() {
        console.log("[auto_toc] - registerMenuCommand, menu_ALL : ", menu_ALL);
        for (let i = 0; i < menu_ID.length; i++) {
            // 因为 safari 的各个油猴平台都还没支持好 GM_unregisterMenuCommand , 所以先只让非 safari 的跑, 这会导致 safari 里用户关闭显示 toc 开关的时候, 相关菜单的✅不会变成❎
            if (!isSafari()) {
                // alert("非safari");
                GM_unregisterMenuCommand(menu_ID[i]);
            }
        }
        for (let i = 0; i < menu_ALL.length; i++) {
            // 循环注册脚本菜单
            var currLocalStorage = GM_getValue(menu_ALL[i][0]);
            menu_ID[menu_ID.length + 1] = GM_registerMenuCommand(
                `${currLocalStorage[window.location.host] ? "✅" : "❎"} ${
                    menu_ALL[i][1]
                }`,
                // `${menu_ALL[i][1]}`,
                function () {
                    menuSwitch(`${menu_ALL[i][0]}`);
                }
            );
            // menu_ID[menu_ID.length + 1] = GM_registerMenuCommand(
            //     `${currLocalStorage[window.location.host] ? '✅' : '❎'} ${window.location.host}`,
            //     function () {
            //         menuSwitch(`${menu_ALL[i][0]}`)
            //     }
            // );
        }
        // menu_ID[menu_ID.length] = GM_registerMenuCommand(`🏁 当前版本 ${version}`);
        //menu_ID[menu_ID.length] = GM_registerMenuCommand('💬 反馈 & 建议', function () {window.GM_openInTab('', {active: true,insert: true,setParent: true});});
    }

    //切换选项
    function menuSwitch(localStorageKeyName) {
        var domain2isCollapse = GM_getValue(
            "menu_GAEEScript_auto_collapse_toc"
        );
        if (localStorageKeyName === "menu_GAEEScript_auto_open_toc") {
            var domain2isShow = GM_getValue(`${localStorageKeyName}`);
            var domain2width2offset = GM_getValue(
                "menu_GAEEScript_auto_toc_domain_2_width_2_offset"
            );
            console.log(
                "[auto_toc] - [menuSwitch menu_GAEEScript_auto_open_toc]",
                domain2isShow
            );
            var isCurrShow = domain2isShow[window.location.host];
            if (isCurrShow == null || !isCurrShow) {
                domain2isShow[window.location.host] = true;
                toast("Turn On TOC.");
            } else {
                delete domain2isShow[window.location.host];
                delete domain2width2offset[window.location.host];
                delete domain2isCollapse[window.location.host];

                toast("Turn Off TOC.");
            }
            GM_setValue(`${localStorageKeyName}`, domain2isShow);
            GM_setValue(
                "menu_GAEEScript_auto_toc_domain_2_width_2_offset",
                domain2width2offset
            );
            GM_setValue("menu_GAEEScript_auto_collapse_toc", domain2isCollapse);
            handleToc();
        } else if (localStorageKeyName === "menu_GAEEScript_auto_collapse_toc") {
            console.log(
                "[menuSwitch menu_GAEEScript_auto_collapse_toc]",
                domain2isCollapse
            );
            var isCurrDim = domain2isCollapse[window.location.host];
            if (isCurrDim == null || !isCurrDim) {
                domain2isCollapse[window.location.host] = true;
                toast("Turn On TOC Auto Collapse.");
            } else {
                delete domain2isCollapse[window.location.host];
                toast("Turn Off TOC Auto Collapse.");
            }
            GM_setValue(`${localStorageKeyName}`, domain2isCollapse);
            handleToc();
        } else if (localStorageKeyName === "menu_GAEEScript_shrink_img") {
            var domain2shouldShrinkImg = GM_getValue(
                "menu_GAEEScript_shrink_img"
            );
            console.log(
                "[menuSwitch menu_GAEEScript_shrink_img]",
                domain2shouldShrinkImg
            );
            var shouldShrinkImg = domain2shouldShrinkImg[window.location.host];
            if (shouldShrinkImg == null || !shouldShrinkImg) {
                domain2shouldShrinkImg[window.location.host] = true;
                toast("Turn On Shrink IMG.");
            } else {
                delete domain2shouldShrinkImg[window.location.host];
                toast("Turn Off Shrink IMG.");
            }
            GM_setValue(`${localStorageKeyName}`, domain2shouldShrinkImg);
            shrinkImg(true);
        }
        // 因为 safari 的各个油猴平台都还没支持好 GM_unregisterMenuCommand , 所以先只让非 safari 的跑, 这会导致 safari 里用户关闭显示 toc 开关的时候, 相关菜单的✅不会变成❎
        if (!isSafari()) {
            // alert("非safari");
            registerMenuCommand(); // 重新注册脚本菜单
        }
        // location.reload(); // 刷新网页
    }

    let isMf = false;
    try {
        isMf = isMasterFrame(window);
    } catch (e) {}
    if (isMf) {
        // if (true) {
        if (shouldLog) console.log("[auto_toc] - running !!!");
        // 貌似无用
        // 可以检查pageshow 事件的persisted属性，当页面初始化加载的时候，persisted被设置为false，当页面从缓存中加载的时候，persisted被设置为true。因此，上面代码的意思就是：
        // 如果页面是从缓存中加载的，那么页面重新加载。
        // window.onpageshow = function(event) {
        //     if (event.persisted) {
        //         // window.location.reload()
        //         console.log("ex-smart-toc handle toc when open web from cache !!!")
        //         handleToc()
        //     }
        // };

        // if( ('onhashchange' in window) && ((typeof document.documentMode==='undefined') || document.documentMode==8)) {
        //     // 浏览器支持onhashchange事件
        //     console.log("ex-smart-toc register window.onhashchange to handleToc !!!")
        //     // window.onhashchange = handleToc;  // 对应新的hash执行的操作函数
        //     window.onhashchange = function(event) {
        //         console.log("ex-smart-toc window.onhashchange trigger handleToc !!!")
        //         handleToc()
        //     }
        // } else {
        // 不支持则用定时器检测的办法
        //     setInterval(function() {
        //         // 检测hash值或其中某一段是否更改的函数， 在低版本的iE浏览器中通过window.location.hash取出的指和其它的浏览器不同，要注意
        // 　　　　 var ischanged = isHashChanged();
        //         if(ischanged) {
        //             handleToc();  // 对应新的hash执行的操作函数
        //         }
        //     }, 150);
        // }

        handleMenu();

        const urlObj = new URL(window.location.href);
        if (urlObj.host.indexOf("zhihu.com") >= 0) {
            //////////////////////////////////////// 知乎-向下翻时自动隐藏顶栏&自动重定向
            if (shouldLog) console.log("[auto_toc] - [hide-top-bar-when-scroll-down-and-auto-redirect]");

            function zhihuAutoRedirect() {
                let nodes = document.querySelectorAll(
                    ".RichText a[href*='//link.zhihu.com/?target']"
                );
                for (let i = 0; i < nodes.length; i++) {
                    let url = decodeURIComponent(
                        nodes[i].href.replace(
                            /https?:\/\/link\.zhihu\.com\/\?target=/,
                            ""
                        )
                    );
                    nodes[i].href = url;
                }
            }
            setTimeout(zhihuAutoRedirect, 10);
            setTimeout(zhihuAutoRedirect, 500);
            for (let i = 1; i <= 66; i++) {
                setTimeout(zhihuAutoRedirect, 1000 * i);
            }

            setTimeout(() => {
                let pendingRemove = document.querySelectorAll(".ColumnPageHeader");
                if (pendingRemove.length > 0) {
                    let cp = pendingRemove[0];
                    cp.style.display = "none";
                }
                pendingRemove = document.querySelectorAll(".AuthorCard");
                if (pendingRemove.length > 0) {
                    let cp = pendingRemove[0];
                    cp.style.display = "none";
                }
            }, 3600);
            // let style = "";
            // let style_3 = `/* 向下翻时自动隐藏顶栏*/
            //     header.is-hidden {display: none;}
            // `;
            // style += style_3;
            // let style_Add = document.createElement("style");

            // if (document.lastChild) {
            //     document.lastChild.appendChild(style_Add).textContent = style;
            // } else {
            //     // 避免网站加载速度太慢的备用措施
            //     let timer1 = setInterval(function () {
            //         // 每 10 毫秒检查一下 html 是否已存在
            //         if (document.lastChild) {
            //             clearInterval(timer1); // 取消定时器
            //             document.lastChild.appendChild(style_Add).textContent =
            //                 style;
            //         }
            //     }, 10);
            // }
        } else if (urlObj.host.indexOf("www.google.com") >= 0) {
            //////////////////////////////////////// google-禁止重定向
            if (shouldLog) console.log("[auto_toc] - [anti-google-redirect]");
            function redirectHandle() {
                try {
                    let resultNodes = document.querySelectorAll(
                        ".g .rc a, #rs, #rso .g a"
                    );
                    for (let i = 0; i < resultNodes.length; i++) {
                        let one = resultNodes[i];
                        one.setAttribute("onmousedown", ""); // 谷歌去重定向干扰
                        one.setAttribute("target", "_blank"); // 谷歌链接新标签打开
                        one.setAttribute("data-jsarwt", "0"); // Firefox谷歌去重定向干扰
                    }
                } catch (e) {
                    if (shouldLog) console.log(e);
                }
            }

            setTimeout(redirectHandle, 10);
            setTimeout(redirectHandle, 500);
            for (let i = 1; i <= 66; i++) {
                setTimeout(redirectHandle, 1000 * i);
            }
        } else if (urlObj.host.indexOf("leetcode.com") >= 0 || urlObj.host.indexOf("leetcode.cn") >= 0) {
            setTimeout(() => {
                // if (shouldLog) 
                //     console.log("[auto_toc] - [replace-leetcode-premiumButton-to-cn]");
                // // 选择按钮
                // const premiumButton = document.querySelector('a[href="/subscribe/?ref=lp_pl&source=qd"]');
                // // 修改链接
                // if (premiumButton) {
                //     premiumButton.setAttribute('href', 'https://leetcode.cn' +  window.location.pathname); // window.location.pathname: 获取当前链接的路径部分（去掉域名部分
                //     premiumButton.setAttribute('target', '_blank'); // 可选：新窗口打开
                // }
                if (shouldLog) 
                    console.log("[auto_toc] - [add-leetcode-cn/com-button]");
                // // 选择目标元素
                // const targetDiv = document.querySelector('.ml-0');
                // // 插入新的 <div>
                // targetDiv.insertAdjacentHTML('afterend', '<div class="ml-0"><a href="https://leetcode.cn'+ window.location.pathname + '"  target="_blank"><span class="display-none h-8 w-[26px] cursor-pointer  rounded-[8px] bg-[#ffa1161f] text-center leading-8 transition-colors hover:bg-[#ffa11633] lg:inline-block font-typo"><span class="text-brand-orange">cn</span></span></a></div>');

                // 选择目标元素
                const targetDiv = document.querySelector('.relative.ml-4.flex.items-center.gap-2');
                // 在目标元素末尾插入新内容
                let domainSuffix = 'com';
                if (urlObj.host.indexOf("leetcode.com") >= 0) {
                    domainSuffix = 'cn';
                }
                targetDiv.insertAdjacentHTML('beforeend','<div class="ml-0"><a href="https://leetcode.' + domainSuffix + window.location.pathname + '"  target="_blank"><span class="display-none h-8 w-[32px] cursor-pointer  rounded-[8px] bg-[#ffa1161f] text-center leading-8 transition-colors hover:bg-[#ffa11633] lg:inline-block font-typo"><span class="text-brand-orange">' + domainSuffix + '</span></span></a></div>');
            }, 3600);
        } else if (urlObj.host.indexOf("replit.com") >= 0) {
            // setTimeout(() => {
            //     if (shouldLog)
            //         console.log("[auto_toc] - [replace-AI-icon-for-replit.com]");
            //     const buttons = document.querySelectorAll(".css-89a5ul");
            //     if (buttons.length > 0) {
            //         let btn = buttons[0];
            //         btn.style.display = "none";
            //         btn = buttons[1];
            //         btn.style.display = "none";
            //     }
            // }, 6600);
            let cnt = 0;
            let checkInterval = setTimeout(function internal() {
                const buttons = document.querySelectorAll(".css-89a5ul");
            
                if (buttons.length > 0) {
                    if ((typeof shouldLog === "undefined" || shouldLog) && cnt == 0) {
                        console.log("[auto_toc] - [replace-AI-icon-for-replit.com]");
                    }
                    if (buttons[0] && buttons[0].style.display != "none") {
                        buttons[0].style.display = "none";
                        console.log("[auto_toc] - [replace-AI-icon-for-replit.com] 0 none");
                    }
                    if (buttons[1] && buttons[1].style.display != "none") {
                        buttons[1].style.display = "none";
                        console.log("[auto_toc] - [replace-AI-icon-for-replit.com] 1 none");
                    }
                }
                cnt++;
                if (cnt > 20) {
                    console.log("[auto_toc] - [replace-AI-icon-for-replit.com] stop looping");
                    return; // 停止
                }
            
                checkInterval = setTimeout(internal, 500); // 继续轮询
            }, 500);
        } else if (urlObj.host.indexOf("programmercarl.com") >= 0) {
            //////////////////////////////////////// 代码随想录 把leetcode.cn 替换为 leetcode.com
            if (shouldLog) console.log("[auto_toc] - [replace-leetcode-cn-to-com]");
            function replaceLeetCodeLinks() {
                // 获取页面上所有的<a>元素
                const links = document.querySelectorAll("a");

                // 遍历这些链接
                links.forEach((link) => {
                    // 检查链接的href属性是否包含'leetcode.cn'
                    if (link.href.includes("leetcode.cn")) {
                        // 使用字符串的replace方法替换'leetcode.cn'为'leetcode.com'
                        // 注意：这里假设链接的协议部分（如http://或https://）之后直接跟着'leetcode.cn'
                        // 如果链接的格式更复杂，你可能需要调整正则表达式来更准确地匹配和替换
                        link.href = link.href.replace(
                            /leetcode\.cn/g,
                            "leetcode.com"
                        );

                        // 如果链接的href属性中可能包含子域名（如www.leetcode.cn），你可能需要更复杂的替换逻辑
                        // 例如，使用正则表达式来匹配整个域名部分
                        // link.href = link.href.replace(/https?:\/\/[^\/]*leetcode\.cn\//g, 'https://leetcode.com/');
                    }
                });
            }

            // setInterval(replaceLeetCodeLinks, 1000);

            // because programmercarl.com is a single-page website, so we have to add some history observer to trigger the replacer.
            (function () {
                const observer = new MutationObserver(() => {
                    if (shouldLog) console.log("[auto_toc] - DOM mutation detected. Current URL:", window.location.href);
                    replaceLeetCodeLinks();
                });

                observer.observe(document, { childList: true, subtree: true });

                const originalPushState = history.pushState;
                history.pushState = function (...args) {
                    if (shouldLog) console.log("[auto_toc] - pushState called. URL changed to:", args[2]);
                    replaceLeetCodeLinks();
                    observer.disconnect();
                    observer.observe(document, {
                        childList: true,
                        subtree: true,
                    });
                    return originalPushState.apply(this, args);
                };

                const originalReplaceState = history.replaceState;
                history.replaceState = function (...args) {
                    if (shouldLog) console.log("[auto_toc] - replaceState called. URL changed to:", args[2]);
                    replaceLeetCodeLinks();
                    observer.disconnect();
                    observer.observe(document, {
                        childList: true,
                        subtree: true,
                    });
                    return originalReplaceState.apply(this, args);
                };

                window.addEventListener("popstate", () => {
                    if (shouldLog) console.log("[auto_toc] - URL changed via back/forward navigation:", window.location.href);
                });
            })();
        }

        //////////////////////////////////////// 所有网站-缩小图片
        var domain2shouldShrinkImg = GM_getValue("menu_GAEEScript_shrink_img");
        var shouldShrinkImg = domain2shouldShrinkImg[window.location.host];
        let shouldNotShrink = shouldShrinkImg == null || !shouldShrinkImg;
        if (!shouldNotShrink) {
            if (shouldLog) console.log("[auto_toc] - [shrinkImg]");
            setTimeout(shrinkImg, 10);
        }

        //////////////////////////////////////// 所有网站-生成toc
        if (GM_getValue("menu_GAEEScript_auto_toc_domain_2_width_2_offset") == null) {
            GM_setValue("menu_GAEEScript_auto_toc_domain_2_width_2_offset", {});
        }
        if (GM_getValue("menu_GAEEScript_auto_collapse_toc") == null) {
            GM_setValue("menu_GAEEScript_auto_collapse_toc", {});
        }

        handleToc();
    }
})();


// ============================================================
// Youdao Dictionary web-page shortcut
// ============================================================
(function initYoudaoDictionaryShortcut() {
    "use strict";

    const BUTTON_CLASS = "auto-toc-youdao-web-button";
    const STYLE_ID = "auto-toc-youdao-web-button-style";
    const HOST_SELECTOR = "#yd-mg-huaci-host";
    const HOST_FALLBACK_SELECTOR = "[id^='yd-mg-huaci']";

    const BUTTON_ICONS = {
        word: "📖",
        result: "🔎",
    };

    const processedRoots = new WeakSet();
    const cardWords = new WeakMap();
    let lastSelectedEnglishWord = "";

    function normalizeEnglishWord(value) {
        const word = String(value || "").trim();
        // Accept a single English word, including common apostrophe/hyphen forms.
        return /^[A-Za-z][A-Za-z'-]*$/.test(word) ? word : "";
    }

    function readSelectedEnglishWord() {
        try {
            return normalizeEnglishWord(window.getSelection()?.toString());
        } catch (_) {
            return "";
        }
    }

    function rememberSelection() {
        const word = readSelectedEnglishWord();
        if (word) lastSelectedEnglishWord = word;
    }

    // Capture the selected word before clicking a popup control can clear the selection.
    document.addEventListener("selectionchange", rememberSelection, true);
    document.addEventListener("mouseup", rememberSelection, true);
    document.addEventListener("dblclick", rememberSelection, true);
    document.addEventListener("keyup", rememberSelection, true);

    function addStyles(root) {
        if (!root || !root.appendChild) return;
        if (root.querySelector?.(`#${STYLE_ID}`)) return;

        const style = document.createElement("style");
        style.id = STYLE_ID;
        style.textContent = `
            .${BUTTON_CLASS} {
                width: 28px !important;
                height: 28px !important;
                display: inline-flex !important;
                align-items: center !important;
                justify-content: center !important;
                flex: 0 0 28px !important;
                margin: 0 6px 0 0 !important;
                padding: 0 !important;
                border: 0 !important;
                border-radius: 6px !important;
                background: transparent !important;
                color: #666 !important;
                cursor: pointer !important;
                box-sizing: border-box !important;
                font-size: 19px !important;
                line-height: 1 !important;
                font-family: system-ui, -apple-system, sans-serif !important;
            }
            .${BUTTON_CLASS}:hover {
                background: #f0f0f0 !important;
                color: #1677ff !important;
            }
            .${BUTTON_CLASS} {
                text-decoration: none !important;
            }
        `;
        root.appendChild(style);
    }

    function getYoudaoWord(card) {
        // The selected English text is authoritative. Youdao's .hc-word may
        // show a Chinese translation (e.g. “用户脚本”) instead of the source word.
        const selected = readSelectedEnglishWord() || lastSelectedEnglishWord;
        if (selected) {
            if (card) cardWords.set(card, selected);
            return selected;
        }

        const cached = card ? cardWords.get(card) : "";
        if (cached) return cached;

        const wordElement = card?.querySelector(".hc-word");
        const popupWord = normalizeEnglishWord(wordElement?.textContent);
        if (popupWord && card) cardWords.set(card, popupWord);
        return popupWord;
    }

    function createYoudaoLink(className, title, urlBuilder, label) {
        const link = document.createElement("a");
        link.className = `hc-footer-action ${BUTTON_CLASS} ${className}`;
        link.title = title;
        link.setAttribute("aria-label", title);
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        link.textContent = BUTTON_ICONS[label] || "↗";

        function updateDestination() {
            const card = link.closest(".hc-card");
            const word = getYoudaoWord(card);
            if (!word) {
                link.removeAttribute("href");
                link.setAttribute("aria-disabled", "true");
                return "";
            }

            const url = urlBuilder(word);
            link.href = url;
            link.removeAttribute("aria-disabled");
            return url;
        }

        // Set a real href as soon as the buttons are created, not only after
        // the user begins clicking. Refresh it again immediately before navigation.
        updateDestination();
        link.addEventListener("pointerdown", updateDestination, true);
        link.addEventListener("mousedown", updateDestination, true);
        link.addEventListener("focus", updateDestination, true);
        link.addEventListener("click", (event) => {
            const url = updateDestination();
            if (!url) {
                event.preventDefault();
                return;
            }
            // Keep native anchor navigation: no window.open race or placeholder "#".
        });

        return link;
    }

    function addButtonToCard(card) {
        if (!card || !(card instanceof Element)) return false;
        if (!card.matches(".hc-card")) return false;

        const footer = card.querySelector(".hc-footer-actions");
        if (!footer) return false;

        if (footer.querySelector(`.${BUTTON_CLASS}`)) return true;

        const wordLink = createYoudaoLink(
            "auto-toc-youdao-word-button",
            "在有道词典中打开单词页面",
            (word) => `https://dict.youdao.com/w/${encodeURIComponent(word)}`,
            "word"
        );

        const resultLink = createYoudaoLink(
            "auto-toc-youdao-result-button",
            "在有道词典中打开结果页面",
            (word) =>
                `https://dict.youdao.com/result?word=${encodeURIComponent(word)}&lang=en`,
            "result"
        );

        // Put both new buttons immediately before Youdao's Copy button.
        const copyButton = footer.querySelector(".hc-copy-action");
        if (copyButton) {
            footer.insertBefore(resultLink, copyButton);
            footer.insertBefore(wordLink, resultLink);
        } else {
            footer.appendChild(wordLink);
            footer.appendChild(resultLink);
        }

        addStyles(card.getRootNode());
        return true;
    }

    function scanYoudaoRoot(root) {
        if (!root || !root.querySelectorAll) return false;

        addStyles(root);

        const cards = root.querySelectorAll(".hc-card");
        let found = false;
        cards.forEach((card) => {
            if (addButtonToCard(card)) found = true;
        });
        return found;
    }

    function getYoudaoShadowRoot() {
        const host =
            document.querySelector(HOST_SELECTOR) ||
            document.querySelector(HOST_FALLBACK_SELECTOR);

        return host?.shadowRoot || null;
    }

    function observeYoudaoShadowRoot(root) {
        if (!root || processedRoots.has(root)) return;
        processedRoots.add(root);

        scanYoudaoRoot(root);

        const observer = new MutationObserver(() => {
            // Youdao frequently replaces the contents of hc-card while reusing
            // the same ShadowRoot. A direct rescan is therefore intentional.
            scanYoudaoRoot(root);
        });

        observer.observe(root, {
            childList: true,
            subtree: true,
            characterData: true,
        });
    }

    function tryInstall() {
        const root = getYoudaoShadowRoot();
        if (!root) return false;

        observeYoudaoShadowRoot(root);
        return scanYoudaoRoot(root);
    }

    function installSafariFallback() {
        // Safari has no Youdao floating-translation extension in this setup.
        // When that extension host is absent, show a small toolbar for a
        // selected English word and link directly to both Youdao pages.
        let toolbar = null;
        let rememberedWord = "";

        function getSelectedWord() {
            const selection = window.getSelection();
            const word = normalizeEnglishWord(selection?.toString());
            return word;
        }

        function hideToolbar() {
            if (toolbar) toolbar.style.display = "none";
        }

        function ensureToolbar() {
            if (toolbar) return toolbar;

            toolbar = document.createElement("div");
            toolbar.id = "auto-toc-youdao-safari-toolbar";
            toolbar.style.cssText = [
                "position:fixed",
                "z-index:2147483647",
                "display:none",
                "align-items:center",
                "gap:5px",
                "padding:5px 7px",
                "border:1px solid rgba(127,127,127,.35)",
                "border-radius:10px",
                "background:Canvas",
                "color:CanvasText",
                "box-shadow:0 3px 14px rgba(0,0,0,.22)",
                "font:16px/1 system-ui,-apple-system,sans-serif"
            ].join(";");

            function makeLink(icon, title, urlBuilder) {
                const link = document.createElement("a");
                link.textContent = icon;
                link.title = title;
                link.setAttribute("aria-label", title);
                link.target = "_blank";
                link.rel = "noopener noreferrer";
                link.style.cssText = [
                    "display:inline-flex",
                    "align-items:center",
                    "justify-content:center",
                    "width:30px",
                    "height:30px",
                    "border-radius:6px",
                    "text-decoration:none",
                    "cursor:pointer",
                    "color:inherit"
                ].join(";");

                link.addEventListener("mouseenter", () => {
                    link.style.background = "rgba(127,127,127,.18)";
                });
                link.addEventListener("mouseleave", () => {
                    link.style.background = "transparent";
                });

                link.addEventListener("click", (event) => {
                    // Rebuild the URL from the captured word immediately
                    // before navigation. Keep native anchor behavior.
                    if (!rememberedWord) {
                        event.preventDefault();
                        return;
                    }
                    link.href = urlBuilder(rememberedWord);
                });

                link.dataset.urlKind = icon === "📖" ? "word" : "result";
                link.dataset.urlBuilder = "";
                link.addEventListener("pointerdown", () => {
                    if (rememberedWord) link.href = urlBuilder(rememberedWord);
                });
                return link;
            }

            const wordLink = makeLink(
                "📖",
                "Open Youdao dictionary page",
                (word) => `https://dict.youdao.com/w/${encodeURIComponent(word)}`
            );
            const resultLink = makeLink(
                "🔎",
                "Open Youdao result page",
                (word) => `https://dict.youdao.com/result?word=${encodeURIComponent(word)}&lang=en`
            );

            toolbar.append(wordLink, resultLink);
            document.body.appendChild(toolbar);
            return toolbar;
        }

        function showForSelection() {
            // Don't duplicate the native Youdao-extension buttons on Chrome.
            if (document.querySelector(HOST_SELECTOR) ||
                document.querySelector(HOST_FALLBACK_SELECTOR)) {
                hideToolbar();
                return;
            }

            const word = getSelectedWord();
            if (!word) {
                // Keep the toolbar visible while its own controls are focused.
                return;
            }

            rememberedWord = word;
            lastSelectedEnglishWord = word;

            const selection = window.getSelection();
            if (!selection || selection.rangeCount === 0) return;
            const rect = selection.getRangeAt(0).getBoundingClientRect();
            if (!rect || (!rect.width && !rect.height)) return;

            const bar = ensureToolbar();
            const links = bar.querySelectorAll("a");
            links[0].href = `https://dict.youdao.com/w/${encodeURIComponent(word)}`;
            links[1].href = `https://dict.youdao.com/result?word=${encodeURIComponent(word)}&lang=en`;
            bar.style.display = "inline-flex";

            // Place the toolbar just below the selected word, clamped to viewport.
            const left = Math.max(8, Math.min(rect.left, window.innerWidth - 90));
            const top = Math.max(8, Math.min(rect.bottom + 8, window.innerHeight - 48));
            bar.style.left = `${left}px`;
            bar.style.top = `${top}px`;
        }

        const scheduleShow = () => {
            window.setTimeout(showForSelection, 0);
        };

        document.addEventListener("mouseup", scheduleShow, true);
        document.addEventListener("dblclick", scheduleShow, true);
        document.addEventListener("keyup", scheduleShow, true);

        document.addEventListener("pointerdown", (event) => {
            if (toolbar && toolbar.contains(event.target)) return;
            // Defer so a new text selection can be read after pointer events.
            window.setTimeout(() => {
                if (!getSelectedWord()) hideToolbar();
            }, 0);
        }, true);

        document.addEventListener("keydown", (event) => {
            if (event.key === "Escape") hideToolbar();
        }, true);
    }

    function start() {
        installSafariFallback();

        // The screenshot shows the Youdao UI inside:
        // <y... id="yd-mg-huaci-host"><#shadow-root (open)>...</#shadow-root></y...>
        // Therefore we deliberately target that host instead of trying to
        // discover arbitrary ShadowRoots across the entire page.
        tryInstall();

        // The Youdao extension may create the host only after the userscript
        // has already started. Watch the normal document for the host.
        const documentObserver = new MutationObserver(() => {
            tryInstall();
        });

        documentObserver.observe(document.documentElement, {
            childList: true,
            subtree: true,
        });

        // Safety net: the extension can sometimes populate its open ShadowRoot
        // without producing a useful mutation visible to the page observer.
        // This is intentionally low frequency to avoid page performance impact.
        setInterval(tryInstall, 1000);
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", start, { once: true });
    } else {
        start();
    }
})();



// TEST:
// pass: https://zhuanlan.zhihu.com/p/336727285
// pass: https://zhuanlan.zhihu.com/p/643656433
// pass: https://mp.weixin.qq.com/s/IovIZChwAIIT_kmI7Ry7Aw
// pass: https://mp.weixin.qq.com/s/QI-Bymo9VBzJaM1lWIE_SA
// pass: https://mp.weixin.qq.com/s/hMFUINwCpEdLBoZsnPmjzQ
// pass: https://mp.weixin.qq.com/s?__biz=MzkxNTUwODgzNA==&mid=2247518770&idx=1&sn=0061e739096b2a412f2d19a380444fc5&chksm=c15cd13ff62b5829b33bdb056d0da847d4633ece54ec88516c1de7f4b8c5fea231b04fbe5d99&rd2werd=1#wechat_redirect
// pass: https://mp.weixin.qq.com/s/FXMFfWcycz55_iI23qFT-Q
// pass: https://mp.weixin.qq.com/s/ZFFOhKmshOkosgdksFo_Og
// pass: https://mp.weixin.qq.com/s/f3TKUPy63-U61wjfvIC4zA
// pass: https://mp.weixin.qq.com/s/CrmouLum_XHlRmjnKW8BrQ

