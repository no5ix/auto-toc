// ==UserScript==
// @name         auto-toc
// @name:zh-CN   auto-toc
// @namespace    EX
// @version      2.01
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
// @grant        GM_xmlhttpRequest
// @grant        GM.xmlHttpRequest
// @grant        Scripting.Translation
// @connect       translate.googleapis.com
// @connect       api.cognitive.microsofttranslator.com
// @connect       edge.microsoft.com
// @connect       localhost
// @connect       127.0.0.1
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

            /* Hexo Theme Neo-inspired TOC: typography, heading markers, and tab styling */
            #smarttoc.octotree-edge {
                position: fixed !important; top: 0 !important; right: 0 !important; left: auto !important;
                width: 300px !important; min-width: 0 !important; height: 100vh !important; max-height: 100vh !important;
                padding: 0 !important; margin: 0 !important; overflow: visible !important; pointer-events: none !important;
                box-sizing: border-box !important; border: 0 !important; border-radius: 0 !important;
                background: transparent !important; color: #777 !important; box-shadow: none !important;
                transform: none !important; opacity: 1 !important; contain: layout style !important;
                transition: none !important; z-index: 2147483000 !important;
                font-family: "PingFang SC", "Microsoft YaHei", -apple-system, BlinkMacSystemFont, "Helvetica Neue", sans-serif !important;
                font-size: 16px !important; line-height: 1.8 !important; -webkit-font-smoothing: antialiased !important;
            }
            /* Standalone draggable edge handle is a direct child of body. */
            #smarttoc-edge-handle {
                all: initial !important;
                position: fixed !important; top: 0 !important; right: 0 !important; left: auto !important;
                width: 30px !important; height: 100px !important; min-height: 0 !important;
                box-sizing: border-box !important; display: flex !important; align-items: center !important;
                justify-content: center !important; gap: 4px !important; padding: 7px 5px 17px 14px !important;
                border: 0 !important; border-radius: 8px 0 0 8px !important;
                background: rgba(245,245,245,.96) !important; color: #555 !important;
                -webkit-backdrop-filter: blur(18px) !important; backdrop-filter: blur(18px) !important;
                font: 600 12px/1.2 -apple-system, BlinkMacSystemFont, "Helvetica Neue", sans-serif !important;
                writing-mode: vertical-rl !important; opacity: 1 !important; cursor: grab !important;
                user-select: none !important; -webkit-user-select: none !important; touch-action: none !important;
                z-index: 2147483647 !important; box-shadow: 0 0 6px rgba(0,0,0,.4) !important;
                transition: background 180ms ease, border-color 180ms ease !important;
            }
            #smarttoc-edge-handle * { all: unset; box-sizing: border-box !important; }
            #smarttoc-edge-handle .handle-chevron { display:block !important; font-size:20px !important; line-height:1 !important; pointer-events:none !important; }
            #smarttoc-edge-handle .handle-label { display:block !important; color:#777 !important; font-size:11px !important; line-height:1 !important; pointer-events:none !important; }
            #smarttoc-edge-handle .handle-drag-grip {
                position:absolute !important; bottom:0 !important; left:0 !important; width:100% !important; height:27px !important;
                display:flex !important; align-items:center !important; justify-content:center !important;
                writing-mode:horizontal-tb !important; color:rgba(29,29,31,.6) !important; font-size:13px !important;
                line-height:1 !important; letter-spacing:-2px !important; cursor:ns-resize !important;
                touch-action:none !important; border-radius:0 0 0 8px !important; z-index:2 !important;
            }
            #smarttoc-edge-handle:hover { background:#fff !important; }
            #smarttoc-edge-handle:active, #smarttoc-edge-handle.is-dragging { cursor:grabbing !important; }
            #smarttoc-edge-handle .handle-drag-grip:hover { color:#202024 !important; background:rgba(0,0,0,.06) !important; }
            #smarttoc.octotree-edge.edge-handle-hover:not(.pinned) .toc-panel { transform:translateX(0) !important; pointer-events:auto !important; }
            #smarttoc.octotree-edge.forced-open:not(.pinned) .toc-panel { transform:translateX(0) !important; pointer-events:auto !important; }

            /* Drawer state is driven by the standalone body-level handle. */
            #smarttoc.octotree-edge.edge-handle-hover:not(.pinned) { width:300px !important; }
            #smarttoc.octotree-edge.edge-handle-hover:not(.pinned) .toc-panel {
                transform:translateX(0) !important; pointer-events:auto !important;
            }
            #smarttoc.octotree-edge.edge-handle-hover:not(.pinned) .handle { opacity:0 !important; visibility:hidden !important; transform:translateX(100%) !important; }
            #smarttoc-edge-handle.is-pinned { opacity:0 !important; visibility:hidden !important; pointer-events:none !important; }


            #smarttoc.octotree-edge .handle { pointer-events: auto !important; }
            /* Keep a continuous hover target across the tab-to-panel transition.
               A brief delay prevents repeated open/close flicker when the pointer
               approaches the edge tab slowly. */
            #smarttoc.octotree-edge .toc-panel { pointer-events: none !important; }
            #smarttoc.octotree-edge:has(.handle:hover):not(:has(.handle-drag-grip:hover)),
            #smarttoc.octotree-edge:has(.toc-panel:hover),
            #smarttoc.octotree-edge:focus-within,
            #smarttoc.octotree-edge.pinned { width: 300px !important; }

            html.autotoc-pinned-layout { width:100% !important; max-width:100% !important; box-sizing:border-box !important; overflow-x:clip !important; }
            html.autotoc-pinned-layout body { width:calc(100vw - 300px) !important; max-width:calc(100vw - 300px) !important; margin-right:0 !important; box-sizing:border-box !important; }
            html.autotoc-pinned-layout body > *,
            html.autotoc-pinned-layout body > * > * { max-width:calc(100vw - 300px) !important; box-sizing:border-box !important; }
            html.autotoc-pinned-layout body [style*="position: fixed"],
            html.autotoc-pinned-layout body [style*="position:fixed"] { max-width:calc(100vw - 300px) !important; }

            #smarttoc.octotree-edge .handle {
                position:fixed !important; top:var(--smarttoc-handle-top, calc(50vh - 50px)) !important; right:0 !important; left:auto !important;
                width:30px !important; height:100px !important; min-height:0 !important; box-sizing:border-box !important;
                display:flex !important; align-items:center !important; justify-content:center !important; gap:4px !important;
                padding:7px 5px 17px 14px !important;
                border: 0px solid rgba(0,0,0,.14) !important; border-right:0 !important;
                border-radius:8px 0 0 8px !important; 
                background:rgba(245,245,245,.96) !important;
                -webkit-backdrop-filter:blur(18px) !important; backdrop-filter:blur(18px) !important;
                color:#555 !important; font-size:12px !important; font-family:inherit !important; font-variant:normal !important;
                font-weight:600 !important; letter-spacing:0 !important; writing-mode:vertical-rl !important; transform:none !important;
                opacity:1 !important; cursor:grab !important; user-select:none !important; touch-action:none !important;
                z-index:5 !important;
                box-shadow:0 0 6px rgba(0, 0, 0,0.65) !important;
                transition:background 180ms ease,border-color 180ms ease !important;
            }
            #smarttoc.octotree-edge .handle:active { cursor:grabbing !important; }
            #smarttoc.octotree-edge .handle:hover { background:#fff !important; border-color:rgba(0,0,0,.22) !important; }
            #smarttoc.octotree-edge .handle .handle-chevron { display:block !important; font-size:20px !important; line-height:1 !important; font-weight:400 !important; color:#555 !important; }
            #smarttoc.octotree-edge .handle .handle-label { display:block !important; color:#777 !important; font-size:11px !important; line-height:1 !important; font-weight:650 !important; max-height:58px !important; overflow:hidden !important; flex:0 1 auto !important; pointer-events:none !important; }
            #smarttoc.octotree-edge .handle .handle-drag-grip {
             position:absolute !important; bottom:0 !important; left:0 !important; width:100% !important; height:27px !important; display:flex !important; align-items:center !important; justify-content:center !important; writing-mode:horizontal-tb !important; color:rgba(29,29,31,.48) !important; font-size:13px !important; line-height:1 !important; letter-spacing:-2px !important; cursor:ns-resize !important; touch-action:none !important; border-radius: 0px 0px 0px 8px !important;
                z-index:2 !important; 
             }
            #smarttoc.octotree-edge .handle .handle-chevron { flex:0 0 auto !important; pointer-events:none !important; }
            #smarttoc.octotree-edge .handle .handle-drag-grip:hover { color:#202024 !important; background:rgba(0,0,0,.06) !important; }

            #smarttoc.octotree-edge .toc-panel {
                position:absolute !important; top:0 !important; right:0 !important; bottom:0 !important;
                width:300px !important; height:auto !important; box-sizing:border-box !important; overflow:hidden !important;
                background:#eee !important; color:#777 !important; border:0 !important; 
                
                border-radius:0 !important; box-shadow:0 0 8px rgba(0,0,0,0.65) !important;
                transform:translateX(calc(100% + 2px)) !important; transition:transform 260ms cubic-bezier(.2,.75,.25,1) !important;
                display:flex !important; flex-direction:column !important;
            }
            #smarttoc.octotree-edge:has(.handle:hover):not(:has(.handle-drag-grip:hover)) .toc-panel,
            #smarttoc.octotree-edge:has(.toc-panel:hover) .toc-panel,
            #smarttoc.octotree-edge:focus-within .toc-panel,
            #smarttoc.octotree-edge.pinned .toc-panel { transform:translateX(0) !important; pointer-events:auto !important; }
            /* Drag-grip hover is reserved for repositioning and must not reveal the panel. */
            #smarttoc.octotree-edge:not(.pinned):has(.handle-drag-grip:hover) .toc-panel {
                transform:translateX(calc(100% + 2px)) !important;
                pointer-events:none !important;
            }
            /* Hovering the drag grip is for repositioning only; it must not reveal the drawer. */
            #smarttoc.octotree-edge:has(.handle-drag-grip:hover):not(.pinned) .toc-panel { transform:translateX(calc(100% + 2px)) !important; pointer-events:none !important; }
            /* Do not remove the handle from hit testing as soon as it opens:
               its disappearing hit area causes Safari hover to toggle repeatedly. */
            #smarttoc.octotree-edge:has(.handle:hover):not(:has(.handle-drag-grip:hover)) .handle,
            #smarttoc.octotree-edge:has(.toc-panel:hover) .handle,
            #smarttoc.octotree-edge:focus-within .handle,
            #smarttoc.octotree-edge.pinned .handle { opacity:0 !important; visibility:hidden !important; transform:translateX(100%) !important; transition:opacity 120ms ease,transform 220ms cubic-bezier(.2,.75,.25,1),visibility 0s linear 220ms !important; }

            #smarttoc.octotree-edge .toc-toolbar {
                flex:0 0 68px !important; height:68px !important; box-sizing:border-box !important;
                display:flex !important; align-items:center !important; justify-content:flex-end !important; gap:6px !important;
                padding:0 18px 0 22px !important;  background:#eee !important;
            }
            #smarttoc.octotree-edge .toc-toolbar button {
                all:unset !important; box-sizing:border-box !important; display:inline-flex !important; flex:0 0 28px !important;
                align-items:center !important; justify-content:center !important; width:28px !important; height:28px !important;
                border:0px solid rgba(0,0,0,.07) !important; border-radius:8px !important;
                background:rgba(0,0,0,.045) !important; color:#777 !important;
                font:12px/1 -apple-system,BlinkMacSystemFont,sans-serif !important;
                cursor:pointer !important; transition:color 160ms ease,background 160ms ease,border-color 160ms ease,transform 160ms ease !important;
            }
            #smarttoc.octotree-edge .toc-toolbar button:hover,
            #smarttoc.octotree-edge .toc-toolbar button[aria-pressed="true"] { color:#222 !important; background:rgba(0,0,0,.09) !important; border-color:rgba(0,0,0,.12) !important; }
            #smarttoc.octotree-edge .toc-toolbar button:active { transform:scale(.94) !important; }
            #smarttoc.octotree-edge .toc-toolbar button:focus-visible { outline:2px solid #0a84ff !important; outline-offset:2px !important; }
            #smarttoc.octotree-edge .toc-toolbar .toc-toolbar-title { display:none !important; }

            #smarttoc.octotree-edge .toc-panel > ul {
                position:relative !important; display:block !important; flex:1 1 auto !important; width:100% !important;
                height:auto !important; min-height:0 !important; box-sizing:border-box !important; margin:0 !important;
                padding:18px 12px 22px 10px !important; overflow-y:auto !important; overflow-x:hidden !important;
                background:transparent !important; color:#777 !important; opacity:1 !important; transform:none !important;
                scrollbar-width:thin !important; scrollbar-color:rgba(100,100,100,.35) transparent !important;
            }
            #smarttoc.octotree-edge .toc-panel ul,
            #smarttoc.octotree-edge .toc-panel li { list-style:none !important; }
            #smarttoc.octotree-edge .toc-panel li { display:block !important; margin:0 !important; padding:0 !important; }
            #smarttoc.octotree-edge .toc-row { display:flex !important; align-items:baseline !important; min-height:0 !important; gap:0 !important; border-radius:0 !important; transition:background 140ms ease !important; }
            #smarttoc.octotree-edge .toc-expander {
                all:unset !important; flex:0 0 18px !important; width:18px !important; height:18px !important; display:inline-flex !important;
                align-items:center !important; justify-content:center !important; color:#999 !important; font:12px/1 sans-serif !important;
                cursor:pointer !important; border-radius:0 !important; transition:color 140ms ease,background 140ms ease !important;
            }
            #smarttoc.octotree-edge .toc-expander:hover { color:#222 !important; }
            #smarttoc.octotree-edge .toc-expander:focus-visible { outline:2px solid #0a84ff !important; outline-offset:1px !important; }
            #smarttoc.octotree-edge .toc-expander.empty { cursor:default !important; }
            #smarttoc.octotree-edge .toc-row > a {
                all:unset !important; box-sizing:border-box !important; display:flex !important; flex:1 1 auto !important;
                min-width:0 !important; align-items:baseline !important; gap:8px !important; padding:2px 2px !important;
                border:0 !important; border-radius:0 !important; color:#777 !important;
                font:13px/1.8 "PingFang SC","Microsoft YaHei",-apple-system,BlinkMacSystemFont,sans-serif !important;
                letter-spacing:0 !important; text-decoration:none !important; cursor:pointer !important;
                white-space:normal !important; overflow-wrap:anywhere !important; transition:color 140ms ease !important;
            }
            #smarttoc.octotree-edge .toc-row > a:hover { color:#222 !important; background:transparent !important; }
            #smarttoc.octotree-edge li.active > .toc-row > a { color:#111 !important; background:transparent !important; border-color:transparent !important; font-weight:500 !important; }
            #smarttoc.octotree-edge .toc-level-icon { flex:0 0 18px !important; width:18px !important; display:inline-block !important; color:#999 !important; text-align:center !important; font-size:14px !important; line-height:1 !important; }
            #smarttoc.octotree-edge li.active > .toc-row .toc-level-icon { color:#111 !important; }
            #smarttoc.octotree-edge .toc-children { display:block !important; margin:0 !important; padding:0 0 0 18px !important; }
            #smarttoc.octotree-edge .toc-panel ul.toc-children { margin:0 !important; padding:0 !important; line-height:1.8 !important; }
            #smarttoc.octotree-edge .toc-children.is-collapsed { display:none !important; }
            #smarttoc.octotree-edge .toc-row[data-level="1"] { padding-left:0 !important; }
            #smarttoc.octotree-edge .toc-row[data-level="2"] { padding-left:2px !important; }
            #smarttoc.octotree-edge .toc-row[data-level="3"] { padding-left:4px !important; }
            #smarttoc.octotree-edge .toc-row[data-level="4"] { padding-left:6px !important; }
            #smarttoc.octotree-edge .toc-row[data-level="5"],
            #smarttoc.octotree-edge .toc-row[data-level="6"] { padding-left:8px !important; }
            #smarttoc.octotree-edge .toc-panel > ul::-webkit-scrollbar { width:6px !important; }
            #smarttoc.octotree-edge .toc-panel > ul::-webkit-scrollbar-thumb { border-radius:8px !important; background:rgba(120,120,120,.32) !important; border:2px solid transparent !important; background-clip:padding-box !important; }

            /* Mirror the user's Hexo Theme Neo marker shapes by heading depth. */
            #smarttoc.octotree-edge .toc-row[data-level="1"] .toc-level-icon { color:#999 !important; font-size:80% !important; }
            #smarttoc.octotree-edge .toc-row[data-level="2"] .toc-level-icon { color:#999 !important; font-size:80% !important; }
            #smarttoc.octotree-edge .toc-row[data-level="3"] .toc-level-icon { color:#999 !important; font-size:90% !important; }
            #smarttoc.octotree-edge .toc-row[data-level="4"] .toc-level-icon { color:#999 !important; font-size:70% !important; }
            #smarttoc.octotree-edge .toc-row[data-level="5"] .toc-level-icon { color:#999 !important; font-size:70% !important; }
            #smarttoc.octotree-edge .toc-row[data-level="6"] .toc-level-icon { color:#999 !important; font-size:100% !important; }

            @media (prefers-color-scheme: dark) {
                #smarttoc.octotree-edge .toc-panel { background:#282828 !important; color:#bbb !important; border-left-color:rgba(255,255,255,.10) !important; }
                #smarttoc.octotree-edge .toc-toolbar { background:#282828 !important; border-bottom-color:#424242 !important; }
                #smarttoc.octotree-edge .toc-toolbar .toc-toolbar-title { color:#eee !important; }
                #smarttoc.octotree-edge .toc-toolbar button {
                    color:#d0d0d5 !important; background:rgba(255,255,255,.08) !important;
                    border-color:rgba(255,255,255,.10) !important;
                }
                #smarttoc.octotree-edge .toc-toolbar button:hover,
                #smarttoc.octotree-edge .toc-toolbar button[aria-pressed="true"] {
                    color:#fff !important; background:rgba(255,255,255,.15) !important;
                    border-color:rgba(255,255,255,.18) !important;
                }
                #smarttoc.octotree-edge .toc-expander { color:#999 !important; }
                #smarttoc.octotree-edge .toc-expander:hover { color:#f5f5f5 !important; }
                #smarttoc.octotree-edge .toc-expander:focus-visible { outline-color:#87daff !important; }
                #smarttoc.octotree-edge .toc-row > a { color:#999 !important; }
                #smarttoc.octotree-edge .toc-row > a:hover { color:#fff !important; }
                #smarttoc.octotree-edge li.active > .toc-row > a,
                #smarttoc.octotree-edge li.active > .toc-row .toc-level-icon { color:#87daff !important; }
                #smarttoc.octotree-edge .handle {
                    background:rgba(38,38,38,.98) !important; color:#e5e5e5 !important;
                    border-color:rgba(255,255,255,.14) !important;
                    box-shadow:0 0 8px rgba(0,0,0,.65) !important;
                }
                #smarttoc.octotree-edge .handle:hover { background:#333 !important; border-color:rgba(255,255,255,.24) !important; }
                #smarttoc.octotree-edge .handle .handle-chevron,
                #smarttoc.octotree-edge .handle .handle-label { color:#d0d0d0 !important; }
                #smarttoc.octotree-edge .handle .handle-drag-grip { color:rgba(235,235,235,.55) !important; background:transparent !important; }
                #smarttoc.octotree-edge .handle .handle-drag-grip:hover { color:#fff !important; background:rgba(255,255,255,.09) !important; }
            }
            @media (max-width: 520px) {
                #smarttoc.octotree-edge { width:92vw !important; }
                #smarttoc.octotree-edge:has(.handle:hover):not(:has(.handle-drag-grip:hover)),
                #smarttoc.octotree-edge:has(.toc-panel:hover),
                #smarttoc.octotree-edge:focus-within,
                #smarttoc.octotree-edge.pinned { width:92vw !important; }
                #smarttoc.octotree-edge .toc-panel { width:92vw !important; }
                html.autotoc-pinned-layout body { width:calc(100vw - 92vw) !important; max-width:calc(100vw - 92vw) !important; }
            }
            #smarttoc.octotree-edge.hidden { display:none !important; }

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

        const levelSymbol = (level) => ({ 1: "●", 2: "◆", 3: "▲", 4: "■", 5: "⬟", 6: "⬣" }[level] || "●");

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

        const getActivePath = () => {
            const findPath = (nodes, path = []) => {
                for (const node of nodes) {
                    const nextPath = node.heading ? [...path, node] : path;
                    if (node.heading && node.heading.isActive) return nextPath;
                    const found = findPath(node.children || [], nextPath);
                    if (found) return found;
                }
                return null;
            };
            return findPath(latestTree) || [];
        };

        const expandActivePath = () => {
            const path = getActivePath();
            if (!path.length) return;
            // Match Hexo Theme Neo: keep the active heading and its ancestor path
            // visible, but collapse unrelated branches.
            expandedAll = false;
            expandedNodes.clear();
            path.forEach((node) => {
                if (node.children && node.children.length && node.heading) {
                    expandedNodes.add(node.heading.anchor);
                }
            });
            mithril.redraw();
            scrollActiveToCenter();
        };

        const syncActivePath = () => {
            if (expandedAll) return;
            const path = getActivePath();
            if (!path.length) return;

            const activeBranchAnchors = new Set(
                path.filter((node) => node.children && node.children.length && node.heading)
                    .map((node) => node.heading.anchor)
            );
            let changed = false;

            // The active heading's ancestor path stays expanded. All other branches
            // are collapsed automatically as the reader scrolls through the article.
            for (const anchor of expandedNodes) {
                if (!activeBranchAnchors.has(anchor)) {
                    expandedNodes.delete(anchor);
                    changed = true;
                }
            }
            for (const anchor of activeBranchAnchors) {
                if (!expandedNodes.has(anchor)) {
                    expandedNodes.add(anchor);
                    changed = true;
                }
            }
            if (changed) mithril.redraw();
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
            } else {
                const path = getActivePath();
                path.forEach((node) => {
                    if (node.children && node.children.length && node.heading) {
                        expandedNodes.add(node.heading.anchor);
                    }
                });
            }
            mithril.redraw();
            scrollActiveToCenter();
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
                                    // The scroll-active branch is synchronized on the next active-heading update.
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
                    // Follow the current heading as the page scrolls, like Hexo Theme Neo's
                    // active-current behavior: keep its ancestor path open and hide stale branches.
                    syncActivePath();
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
                        toolbarButton(pinned ? "📍" : "📌", pinned ? "Unpin TOC" : "Keep TOC open", () => {
                            const root = document.getElementById("smarttoc");
                            if (root) {
                                const shouldPin = !root.classList.contains("pinned");
                                root.classList.toggle("pinned", shouldPin);
                                autoTocPinnedLayout(shouldPin);
                                mithril.redraw();
                            }
                        }, pinned),
                        // toolbarButton(expandedAll ? "⊟" : "⊞", expandedAll ? "Collapse all headings" : "Expand all headings", () => setAllExpanded(!expandedAll), expandedAll),
                        // toolbarButton(expandedAll ? "⊖" : "⊕", expandedAll ? "Collapse all headings" : "Expand all headings", () => setAllExpanded(!expandedAll), expandedAll),
                        toolbarButton(expandedAll ? "✖" : "✚", expandedAll ? "Collapse all headings" : "Expand all headings", () => setAllExpanded(!expandedAll), expandedAll),
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
        let handleElement = null;
        let rootElement = null;
        let dragState = null;
        let resizeListener = null;
        let pinObserver = null;
        let rootObserver = null;
        let attachAttempt = 0;
        let disposed = false;
        let installed = false;

        const STORAGE_KEY = "auto_toc_edge_handle_top";
        const HANDLE_HEIGHT = 100;
        const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
        const maxTop = () => Math.max(0, window.innerHeight - HANDLE_HEIGHT);
        const centeredTop = () => maxTop() / 2;
        const readSavedTop = () => {
            const raw = GM_getValue(STORAGE_KEY, null);
            if (raw === null || raw === undefined || raw === "") return null;
            const value = Number(raw);
            return Number.isFinite(value) ? clamp(value, 0, maxTop()) : null;
        };
        const setTop = (top) => {
            if (!handleElement) return 0;
            const value = clamp(top, 0, maxTop());
            handleElement.style.setProperty("top", "0px", "important");
            handleElement.style.setProperty("transform", "translate3d(0," + value + "px,0)", "important");
            handleElement.dataset.autoTocDragTop = String(value);
            return value;
        };
        const getTop = () => {
            if (!handleElement) return centeredTop();
            const value = Number(handleElement.dataset.autoTocDragTop);
            return Number.isFinite(value) ? clamp(value, 0, maxTop()) : centeredTop();
        };
        const setPinState = (pinned) => {
            if (!rootElement) return;
            rootElement.classList.toggle("pinned", !!pinned);
            if (typeof autoTocPinnedLayout === "function") autoTocPinnedLayout(!!pinned);
            if (typeof mithril !== "undefined" && typeof mithril.redraw === "function") mithril.redraw();
        };

        const beginDrag = (event) => {
            const target = event.target instanceof Element ? event.target : null;
            if (!handleElement || !target || !target.closest(".handle-drag-grip")) return;
            if (event.button !== 0 || dragState) return;
            event.preventDefault();
            event.stopPropagation();
            const state = {
                pointerId: event.pointerId,
                startY: event.clientY,
                startTop: getTop(),
                latestY: event.clientY,
                frame: 0,
            };
            dragState = state;
            handleElement.classList.add("is-dragging");
            // Immediately close the drawer and suspend hover-driven opening for
            // the entire drag gesture.
            if (rootElement) rootElement.classList.remove("edge-handle-hover");
            try { handleElement.setPointerCapture(event.pointerId); } catch (_) {}
        };

        const moveDrag = (event) => {
            const state = dragState;
            if (!state || (state.pointerId !== null && event.pointerId !== state.pointerId)) return;
            if (!Number.isFinite(event.clientY)) return;
            state.latestY = event.clientY;
            if (!state.frame) {
                state.frame = requestAnimationFrame(() => {
                    if (dragState !== state) return;
                    state.frame = 0;
                    setTop(state.startTop + state.latestY - state.startY);
                });
            }
            event.preventDefault();
            event.stopPropagation();
        };

        const endDrag = (event) => {
            const state = dragState;
            if (!state || (event && state.pointerId !== null && event.pointerId !== state.pointerId)) return;
            if (state.frame) {
                cancelAnimationFrame(state.frame);
                state.frame = 0;
                setTop(state.startTop + state.latestY - state.startY);
            }
            const top = getTop();
            dragState = null;
            if (handleElement) handleElement.classList.remove("is-dragging");
            // Do not reopen on pointerup itself. Normal hover handlers will reopen
            // only after a fresh pointer-enter/move following the drag.
            if (event && handleElement && handleElement.hasPointerCapture?.(event.pointerId)) {
                try { handleElement.releasePointerCapture(event.pointerId); } catch (_) {}
            }
            GM_setValue(STORAGE_KEY, Math.round(top));
        };

        const removeHandle = () => {
            disposed = true;
            if (rootObserver) rootObserver.disconnect();
            rootObserver = null;
            if (dragState) endDrag();
            if (handleElement) {
                handleElement.removeEventListener("pointerdown", beginDrag, true);
                window.removeEventListener("pointermove", moveDrag, true);
                window.removeEventListener("pointerup", endDrag, true);
                window.removeEventListener("pointercancel", endDrag, true);
                handleElement.remove();
            }
            if (resizeListener) window.removeEventListener("resize", resizeListener);
            if (pinObserver) pinObserver.disconnect();
            handleElement = null;
            rootElement = null;
            resizeListener = null;
            pinObserver = null;
            installed = false;
        };

        const mountHandleWhenReady = () => {
            if (disposed || installed) return;
            rootElement = document.getElementById("smarttoc");
            if (!rootElement || !document.body) return;

            const existing = document.getElementById("smarttoc-edge-handle");
                if (existing && existing.parentElement !== document.body) existing.remove();
                if (existing && existing.parentElement === document.body) {
                    handleElement = existing;
                } else {
                    handleElement = document.createElement("div");
                    handleElement.id = "smarttoc-edge-handle";
                    handleElement.className = "handle";
                    handleElement.title = "Hover to open AutoTOC";
                    handleElement.innerHTML = '<span class="handle-chevron" aria-hidden="true">⌵</span><span class="handle-label" aria-hidden="true"></span><span class="handle-drag-grip" title="Drag to reposition" aria-label="Drag to reposition">☰</span>';
                    document.body.appendChild(handleElement);
                }

                setTop(readSavedTop() ?? centeredTop());
                installed = true;
                handleElement.addEventListener("pointerdown", beginDrag, true);
                window.addEventListener("pointermove", moveDrag, true);
                window.addEventListener("pointerup", endDrag, true);
                window.addEventListener("pointercancel", endDrag, true);
                window.addEventListener("blur", () => endDrag());

                // The parent remains the source of truth for open/pinned state;
                // the independent handle only dispatches the existing UI action.
                handleElement.addEventListener("click", (event) => {
                    if (event.target.closest(".handle-drag-grip")) {
                        event.preventDefault();
                        event.stopPropagation();
                        return;
                    }
                    if (rootElement && rootElement.classList.contains("pinned")) return;
                    rootElement && rootElement.classList.toggle("forced-open");
                }, true);

                resizeListener = () => setTop(getTop());
                window.addEventListener("resize", resizeListener);

                // Sync drawer visibility with hover on the independent handle.
                const syncHover = () => {
                    if (!rootElement) return;
                    // Dragging always wins over hover: keep the drawer closed until
                    // the pointer is released, even if the handle remains under it.
                    if (dragState) {
                        rootElement.classList.remove("edge-handle-hover");
                        return;
                    }
                    if (rootElement.classList.contains("pinned")) return;
                    const active = handleElement.matches(":hover") || !!rootElement.querySelector(".toc-panel:hover");
                    rootElement.classList.toggle("edge-handle-hover", active);
                };
                handleElement.addEventListener("pointerenter", syncHover);
                handleElement.addEventListener("pointermove", syncHover);
                handleElement.addEventListener("pointerleave", () => {
                    requestAnimationFrame(() => {
                        if (!rootElement || dragState) return;
                        const panel = rootElement.querySelector(".toc-panel");
                        rootElement.classList.toggle("edge-handle-hover", !!(panel && panel.matches(":hover")));
                    });
                });
                rootElement.addEventListener("pointerenter", syncHover);
                rootElement.addEventListener("pointermove", syncHover);
                rootElement.addEventListener("pointerleave", () => {
                    if (rootElement && !handleElement.matches(":hover")) rootElement.classList.remove("edge-handle-hover");
                });

                pinObserver = new MutationObserver(() => {
                    const pinned = rootElement && rootElement.classList.contains("pinned");
                    handleElement.classList.toggle("is-pinned", !!pinned);
                });
                pinObserver.observe(rootElement, { attributes: true, attributeFilter: ["class"] });
                handleElement.classList.toggle("is-pinned", rootElement.classList.contains("pinned"));
        };

        return {
            oncreate() {
                disposed = false;
                mountHandleWhenReady();
                // Mithril may call this component's oncreate before the sibling
                // or parent has been inserted into the document. Keep watching
                // briefly for #smarttoc rather than silently abandoning the handle.
                if (!installed && document.documentElement) {
                    rootObserver = new MutationObserver(() => {
                        if (!installed) mountHandleWhenReady();
                        if (installed && rootObserver) {
                            rootObserver.disconnect();
                            rootObserver = null;
                        }
                    });
                    rootObserver.observe(document.documentElement, { childList: true, subtree: true });
                    // Also handle a delayed body/document lifecycle without polling.
                    const attempt = ++attachAttempt;
                    queueMicrotask(() => {
                        if (!disposed && !installed && attempt === attachAttempt) mountHandleWhenReady();
                    });
                }
            },
            onremove() {
                removeHandle();
            },
            view() {
                return mithril("span.smarttoc-handle-placeholder", { "aria-hidden": "true" });
            },
        };
    };
