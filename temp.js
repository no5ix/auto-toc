// ==UserScript==
// @name         知乎看图模式
// @namespace    https://github.com/cheezone, https://github.com/ACodingJie
// @version      5.0
// @description  借鉴'知乎看图脚本', 添加了隐藏图片/缩略图片/正常图片模式(支持 GIF / 视频), 几种功能, 愉快摸鱼, 让我们愉快地看图吧!
// @author       以茄之名, Jie
// @author:en    Chezz, Jie
// @homepage     https://www.zhihu.com/people/iCheez
// @match        https://www.zhihu.com/question/*
// @grant        none
// @require      https://code.jquery.com/jquery-3.3.1.slim.min.js
// ==/UserScript==

(function() {
    'use strict';
    // 当前页面前5秒 去除烦人的登录提醒
    window.addEventListener("focus", onFocus);
    function onFocus(){
        var timesRun = 0;
        var interval = setInterval (function (){
            timesRun += 1;
            if (timesRun === 10){
                clearInterval (interval);
            }
            $('.Modal-closeButton').trigger("click")
        }, 500);
    }
    var timesRun = 0;
    var interval = setInterval (function (){
        timesRun += 1;
        if (timesRun === 10){
            clearInterval (interval);
        }
        $('.Modal-closeButton').trigger("click")
    }, 500);

    var css=`.Select-option:hover{background-color:rgb(246,246,246)}.Select-option{background-color:rgb(256,256,256)} `
    //按钮之间总是会粘结,特别恶心
    var head = document.head || document.getElementsByTagName('head')[0];
    var style = document.createElement('style');
    style.type = 'text/css';
    style.appendChild(document.createTextNode(css));
    head.appendChild(style);
    var appendChild = Node.prototype.appendChild;
    $(".RichText:has(figure)").parents('.AnswerItem').addClass('has-img');
    Node.prototype.appendChild = function() {
        if(this.classList&&this.classList.contains('RichContent')){
            if($(this).find('.RichText:has(figure)').length>0){
                $(this).parents('.AnswerItem').addClass('has-img');
                if($("figure").hasClass('display-none')){
                    $("figure").css('display','none')
                    $(".RichText-video").css('display','none')
                } else {
                    $("figure").css('display','')
                    $(".RichText-video").css('display','')
                }
                if($("figure").hasClass('width-80px')){
                    $("figure").css('width','80px')
                    $(".RichText-video").css('width','80px')
                } else {
                    $("figure").css('width','')
                    $(".RichText-video").css('width','')
                }
            }else if($('body').hasClass('hiden-img')){
                $(this).parents('.AnswerItem').hide();
            }
        }
        if(this.tabIndex==-1 && this.tagName=='DIV'){
            if(this.innerText=='默认排序'){
                console.error(this);
                var but=this.firstChild.cloneNode();
                var hideBut=this.firstChild.cloneNode();
                var reduceBut=this.firstChild.cloneNode();
                var normalBut=this.firstChild.cloneNode();
                hideBut.innerText='隐藏图片';
                reduceBut.innerText='缩略图片';
                normalBut.innerText='正常图片';

                if($('body').hasClass('hiden-img')){
                    but.innerText='恢复答案';
                    $('.Button.Select-button.Select-plainButton.Button--plain').text('默认排序')
                }else{
                    $('.Button.Select-button.Select-plainButton.Button--plain').text('看图模式')
                    but.innerText='只看有图的答案';
                }

                this.insertBefore(but,this.firstChild);
                this.insertBefore(hideBut,this.firstChild);
                this.insertBefore(reduceBut,this.firstChild);
                this.insertBefore(normalBut,this.firstChild);

                but.addEventListener('click', function(event) {
                    if($('body').hasClass('hiden-img')){
                        $('.AnswerItem:not(.has-img)').show();
                        $('body').removeClass('hiden-img')
                    }else{
                        $('.AnswerItem:not(.has-img)').hide();
                        $('body').addClass('hiden-img')
                    }
                });
                hideBut.addEventListener('click', function(event) {
                    $("figure").css('display','none')
                    $(".RichText-video").css('display','none')
                    $("figure").addClass('display-none')
                });
                reduceBut.addEventListener('click', function(event) {
                    $("figure").css('display','')
                    $(".RichText-video").css('display','')
                    $("figure").removeClass('display-none')
                    $("figure").css('width','80px')
                    $(".RichText-video").css('width','80px')
                    $("figure").addClass('width-80px')
                });
                normalBut.addEventListener('click', function(event) {
                    $("figure").css('display','')
                    $("figure").css('width','')
                    $(".RichText-video").css('display','')
                    $(".RichText-video").css('width','')
                    $("figure").removeClass('display-none')
                    $("figure").removeClass('width-80px')
                });

            }
        }
        return appendChild.apply(this, arguments);
    };

})();



// ==UserScript==
// @name               narrow img
// @name:zh-CN         缩小网页图片
// @namespace          daizp
// @version            0.2.0
// @description        缩小网页图片，上班摸鱼专用
// @description:zh-cn  缩小网页图片，上班摸鱼专用
// @author             daizp
// @include            *
// @grant              none
// ==/UserScript==

(function () {
    narrow_img();
    //页面加载完成缩小全部图片
    function narrow_img(){
        var pic = document.getElementsByTagName('img');
        for(var i=0;i<pic.length;i++){
            pic[i].setAttribute('style', 'max-height: 100px; max-width: 200px;');
            //添加鼠标经过事件
            pic[i].setAttribute("onmouseOver","big_img(this)");
            pic[i].setAttribute("onmouseOut","small_img(this)");
        }
    }
    //if(e.getAttribute("style") != null && e.getAttribute("style").indexOf("max-height") > -1) {
    //    e.removeAttribute("style");
    //}
var scriptText=`
//鼠标移入放大图片
function big_img(e){
    e.removeAttribute("style");
}
//鼠标移出缩小图片
function small_img(e){
    e.setAttribute('style', 'max-height: 100px; max-width: 200px;');
}
`;
    //感谢 https://cloud.tencent.com/developer/ask/217625 提供解决方法
    //使用此方法解决 Uncaught ReferenceError 错误
    var newScript = document.createElement("script");
    var inlineScript = document.createTextNode(scriptText);
    newScript.appendChild(inlineScript);
    document.body.appendChild(newScript);
})();