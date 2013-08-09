// ==UserScript==
// @id             cc98_reply_suite
// @name           cc98 reply suite
// @version        0.1
// @namespace      soda@cc98.org
// @author         soda <sodazju@gmail.com>
// @description    
// @include        http://www.cc98.org/dispbbs.asp*
// @include        http://www.cc98.org/reannounce.asp*
// @include        http://www.cc98,org/editannounce.asp*
// @require        http://ajax.googleapis.com/ajax/libs/jquery/2.0.3/jquery.min.js
// @require        https://raw.github.com/sodatea/cc98-userscripts/master/cc98_jssdk_test.user.js
// @run-at         document-end
// ==/UserScript==

// todo:
// 查看原帖
// 未来考虑整合马甲切换器，实现马甲发贴功能
// 发贴的时候因为不知道贴子地址，所以这些功能暂时都没有加进去
// 以后各个功能单独分离出来后可能考虑@include announce.asp


(function() {
var maxTextareaLength = 16240;       // 文本框的最大输入长度(字节数)
var maxSubjectLength = 100;          // 主题框的最大输入长度(字节数)

var INITIAL_CONFIG = {
    autoReply: true,                // 10秒错误后自动读秒回复
    enableMultiquote: false,        // 默认不多重引用
    useRelativeURL: true,           // 使用相对链接
    viewOriginalPost: true,         // 在引用中加入"查看原帖"
    blockQuotedEmotions: false,     // 是否屏蔽引用里的表情和图片

    autoSaveInterval: 1,            // 自动保存间隔(分钟)
    expireTime: 30,                 // 帖子内容过期时间(分钟)
    rtString: '➤➤➤➤➤',          // 原帖链接的提示文字
    rtColor: 'seagreen',            //「查看原帖」的颜色
    defaultReplyContent: '\n',      // 文本框为空时的默认回复内容
    replyTail: ""                   // 小尾巴
};

var config;

function loadConfig() {
    config = JSON.parse(localStorage.getItem('reply_config'));
    if (!config) {
        config = INITIAL_CONFIG;
        storeConfig();
    }
}

function storeConfig() {
    localStorage.setItem('reply_config', JSON.stringify(config));
}

loadConfig();

// 以下都是跟界面有关的函数

// simple jquery draggable div plug-in
// from https://reader-download.googlecode.com/svn/trunk/jquery-draggable/index.html
// modified by soda<sodazju@gmail.com>
$.fn.drags = function(opt) {

    opt = $.extend({
        draggable: "",
        selected: "",
        cursor: "move",
        draggableClass: "draggable",
        preventDefault: true
    }, opt);

    var $draggable = (opt.draggable === "") ? this : $(document).find(opt.draggable); // the one to be dragged
    var $selected = (opt.selected === "") ? this : $(document).find(opt.selected); // the one to be selected

    $draggable.addClass(opt.draggableClass);
    $selected.css('cursor', opt.cursor);

    $selected.on('mousedown', function(e) {
        var pos_y = $draggable.offset().top - e.pageY;
        var pos_x = $draggable.offset().left - e.pageX;

        $(document).on('mousemove', function(e) {
            $draggable.offset({
                "top": e.pageY + pos_y,
                "left": e.pageX + pos_x
            });
        }).on('mouseup', function() {
            $(this).off('mousemove'); // Unbind events from document
        });
        if (opt.preventDefault) {
            e.preventDefault(); // disable selection
        }
    });

    return this;
}

function showExpressionList() {
    if ($('#expression_list').length) return; // 如果页面中已经存在「心情列表」则返回

    $('#subject_line').append('<div id="expression_list"></div>');

    var expressionList = $('#expression_list');
    expressionList.css({
        "position": "fixed",
        "background-color": "#fff",
        "z-index": 100,
        "margin-top": "-25px",
        "margin-left": "-1px"
    });

    for (var i = 1; i <= 22; ++i) {
        var img = $('<img src="http://www.cc98.org/face/face' + i + '.gif">');
        img.css({
            "cursor": "pointer",
            "margin": "0 10px 0 0",
            "border": "0"
        });

        img.click(function() {
            $('#post_expression').children().eq(0).attr('src', this.src);
            $('#expression_list').remove();
        });

        expressionList.append(img);
    }
}

function addUBBCode(key) {
    var elem = document.getElementById('post_content');
    var start = elem.selectionStart;
    var end = elem.selectionEnd;
    var open_tag = '[' + key + ']';
    var close_tag = '[/' + key + ']';
    var sel_txt = elem.value.substring(start,end);
    var replace = open_tag + sel_txt + close_tag;

    elem.value = elem.value.substring(0,start) + replace + elem.value.substring(end);

    elem.focus();
    elem.selectionStart = elem.selectionEnd = start + open_tag.length + sel_txt.length;
}

function showEmotions() {}

// unique id generator
var uid = function() {
    var id = 0;
    return function() {
        return id++;
    }
}();

function uploadFiles() {
    var files = document.getElementById('files').files;

    if (!files.length) {
        document.getElementById('upload_msg').textContent = '请选择要上传的文件';
        return;
    }

    document.getElementById('attach_table').style.display = 'table';
    for (var i = 0, f; i < files.length; ++i) {
        f = files[i];

        var result = document.createElement('tr');
        var name = document.createElement('td');
        var size = document.createElement('td');
        var status = document.createElement('td');

        name.id = 'file' + uid();
        name.className = 'filename';
        name.textContent = f.name;
        size.textContent = (f.size / 1024).toFixed(2) + ' kB';
        status.textContent = '正在上传…';

        result.appendChild(name);
        result.appendChild(size);
        result.appendChild(status);

        document.getElementById('attach_list').appendChild(result);

        // jQuery和原生JS夹杂的风格很不喜欢，不过没办法了
        // 采用闭包的原因是为了防止for循环结束后，上层函数（uploadFile）里各个变量都固定为最后一个
        _cc98.upload(f, function(file_id, image_autoshow) {
            return function(html) {
                var file = $('#' + file_id);

                var pattern = /script>insertupload\('([^']+)'\);<\/script/ig;
                var ubb = pattern.exec(html);

                if (ubb) {
                    // 要插入的ubb代码
                    ubb = ubb[1] + '\n';

                    // 自动显示图片
                    if (image_autoshow) {
                        ubb = ubb.replace(/(,1)/ig, "");
                    }

                    file.next().next().addClass('uploadsuccess').text('上传成功');

                    // 点击文件名插入ubb代码
                    file.css('cursor', 'pointer');
                    file.click(function(ubb) {
                        return function() {
                            var elem = $('#post_content').get(0);
                            var start = elem.selectionStart;
                            var end = elem.selectionEnd;
                            elem.value = elem.value.substring(0,start) + ubb + elem.value.substring(end);
                            elem.focus();
                            elem.selectionStart = elem.selectionEnd = start + ubb.length;
                        }
                    }(ubb));

                } else if (html.indexOf('文件格式不正确') != -1) {
                    file.next().next().addClass('uploadfail').text('文件格式不正确');
                } else {
                    file.next().next().addClass('uploadfail').text('上传失败');
                }
            }
        }(name.id, $('#image_autoshow').prop('checked')));
    }

    // 关闭上传面板
    $('#upload_panel').remove();
}

function makeRelativeURL(content) {
    return content.replace(/(?:http:\/\/)?www\.cc98\.org\/[&=#%\w\+\.\?]+/g, function(match, offset, string){
        return '[url]' + _cc98.formatURL(match) + '[/url]';
    });
}

function atUsers() {
    $('#submitting_status').text('发帖成功，正在跳转…');
    location.reload();
}

function reply() {
    var expr = $('#post_expression').children().eq(0).attr('src')
    expr = expr.substring(expr.lastIndexOf('/') + 1);

    // 考虑到用户可能把默认回复和小尾巴都去掉，所以回复内容仍可能为空
    if ($('#post_content').val() === "") {
        $('#submitting_status').text('帖子内容不能为空');
        return;
    }

    $('#submitting_status').text('发表帖子中…');

    _cc98.reply({
        "url": window.location.href,
        "expression": expr,
        "content": $('#post_content').val(),
        "subject": $('#post_subject').val(),
        "callback": function(html) {
            if (html.indexOf("状态：回复帖子成功") !== -1) {
                // 回复成功，下一步是处理@信息并刷新页面
                atUsers();
            } else if (html.indexOf("本论坛限制发贴距离时间为10秒") !== -1) {
                // 10s倒计时
                for (var i = 0; i != 10; ++i) {
                    setTimeout(function(e) {
                        return function() { $('#submitting_status').text('论坛限制发帖时间间隔10s，倒计时' + (10-e) + 's…'); }
                    }(i), i * 1000);
                }
                // 倒计时结束重新发帖
                setTimeout(reply, 10000);
            } else {
                // 未知错误
                $('#submitting_status').text('未知错误');
            }
        }
    });
}

function submit() {
    // 为空则添加默认回复
    if ($('#post_content').val() === '')
        $('#post_content').val(config.defaultReplyContent);

    // 添加小尾巴
    if (config.replyTail) {
        $('#post_content').val($('#post_content').val() + '\n' + config.replyTail);
    }

    // 相对链接
    $('#post_content').val(makeRelativeURL($('#post_content').val()));

    // 提交回复
    reply();
}

function showDialog() {
    var reply_dialog_html = 
    '<div id="reply_dialog">' +
    '<form id="replyform">' +
    '<ul id="replytable"width="100%">' +
        '<li id="dialog_header">' +
            '<h3 id="replybox_title" class="box_title">' +
                '参与/回复主题' +
                '<span><a id="dialog_close_btn" class="close_btn" title="关闭"></a></span>' +
            '</h3>' +
        '</li>' +
    '' +
        '<li id="subject_line" class="clearfix">' +
            '<label for="post_subject"><a id="post_expression" href="javascript:void(0);"><img src="http://www.cc98.org/face/face7.gif"></a></label>' +
            '<input type="text" id="post_subject" name="post_subject">' +
        '</li>' +
    '' +
        '<li>' +
            '<div id="editor">' +
                '<div id="e_control">' +
                    '<a id="bold" title="加粗" href="javascript:void(0);"><img class="e_ctrl_btn" src="http://file.cc98.org/uploadfile/2013/8/7/22333264497.gif"></a>' +
                    '<a id="strikethrough" title="删除线" href="javascript:void(0);"><img class="e_ctrl_btn" src="http://file.cc98.org/uploadfile/2013/8/7/22525420119.png"></a>' +
                    '<a id="add_emotions" title="表情" href="javascript:void(0);"><img class="e_ctrl_btn" src="http://www.cc98.org/emot/simpleemot/emot88.gif"></a>' +
                    '<a id="add_attachments" href="javascript:void(0);">| 添加附件</a>' +
                '</div>' +
    '' +
                '<textarea id="post_content" role="textbox" aria-multiline="true"></textarea>' +
    '' +
                '<div id="e_statusbar">' +
                    '<span id="e_tip"></span>' +
                    '<span id="e_autosavecount">30 秒后自动保存草稿</span>' +
                    '<a id="e_save" href="javascript:void(0);">保存数据</a>' +
                    '|' +
                    '<a id="e_recover" href="javascript:void(0);">恢复数据</a>' +
                '</div>' +
            '</div>' +
        '</li>' +
    '' +
        '<li>' +
            '<table class="btn_bar">' +
                '<tbody>' +
                    '<tr>' +
                        '<td width="20%"><input type="button" id="submit_post" name="submit_post" class="soda_button" value="提交回复"></td>' +
                        '<td width="80%"><span id="submitting_status"></span></td>' +
                    '</tr>' +
                '</tbody>' +
            '</table>' +
        '</li>' +
    '' +
    '</ul>' +
    '</form>' +
    '' +
    '<table id="attach_table">' +
        '<thead>' +
            '<tr>' +
                '<th width="50%">点击附件文件名，将其添加到帖子内容中</th>' +
                '<th width="20%">大小</th>' +
                '<th width="30%">状态</th>' +
            '</tr>' +
        '</thead>' +
        '<tbody id="attach_list">' +
        '</tbody>' +
    '</table>' +
    '' +
    '</div>';

    var upload_panel_html =
    '<div id="upload_panel">' +
        '<h3 id="upload_title" class="box_title">' +
            '添加附件' +
            '<span><a id="upload_close_btn" class="close_btn" title="关闭"></a></span>' +
        '</h3>' +
        '<input type="file" id="files" name="files[]" multiple>' +
        '<br>' +
        '<table class="btn_bar" width="100%">' +
            '<tbody>' +
                '<tr>' +
                    '<td><input type="checkbox" id="image_autoshow" name="image_autoshow" value="autoshow"><label for="image_autoshow">直接显示图片</label></td>' +
                    '<td><input type="button" id="confirm_upload" name="confirm_upload" class="soda_button" value="上传"></td>' +
                '</tr>' +
            '</tbody>' +
        '</table>' +
        '<div id="upload_msg"></div>' +
    '</div>';

    if ($('#reply_dialog').length) return;
    $('body').append(reply_dialog_html);

    var reply_dialog = $('#reply_dialog');
    reply_dialog.css({
        "top": (document.body.clientHeight - reply_dialog.height()) / 2,
        "left": (document.body.clientWidth - reply_dialog.width()) / 2
    });

    // 各种事件绑定
    $('#replybox_title').drags({"draggable": "#reply_dialog"});
    $('#dialog_close_btn').click(function() { $('#reply_dialog').remove(); });

    $('#post_expression').click(showExpressionList);

    $('#bold').click(function() { addUBBCode('b') });
    $('#strikethrough').click(function() { addUBBCode('del') });

    $('#add_attachments').click(function() {
        if ($('#upload_panel').length) return;

        $('body').append(upload_panel_html);  // 这样每次都会新建一个div而不是重复使用之前的那个
        $('#upload_title').drags({"draggable": "#upload_panel"});
        $('#upload_close_btn').click(function() { $('#upload_panel').remove(); })
        var upload_panel = $('#upload_panel');
        upload_panel.css({
            "top": (document.body.clientHeight - upload_panel.height()) / 2 ,
            "left": (document.body.clientWidth - upload_panel.width()) / 2
        });

        $('#confirm_upload').click(uploadFiles);
    });

    $('#post_content').click(function() { $('#expression_list').remove(); });

    $('#e_save').click(function() { sessionStorage.setItem('cc98_editor_content', $('#post_content').val()); });
    $('#e_recover').click( function() {
        if (confirm('此操作将覆盖当前帖子内容，确定要恢复数据吗？')) {
          $('#post_content').val(sessionStorage.getItem('cc98_editor_content'));
      }
    });

    $('#submit_post').click(submit);

    // 鼠标焦点定到输入框
    $('#post_content').focus();
}


function addOriginalURL(url, storey, quoteContent) {
    var insertIndex = quoteContent.indexOf('[/b]') + 4;
    var quoteURL = _cc98.formatURL(url) + '#' + storey;
    return quoteContent.substring(0, insertIndex) + '  [url=' + quoteURL + ',t=self][color=' + config.rtColor + ']' + config.rtString +
        '[/color][/url]' + quoteContent.substring(insertIndex);
}

// 这里的storey是1-9再到0,，不是从0开始的
function addQuoteContent(url, storey) {
  replyNum = storey + 48;
  if (document.getElementById("reply"+replyNum)){
        var replyurl = document.getElementById("reply"+replyNum).value;
        $.ajax({
            "url": replyurl,
            "success": function(html) {
                var quoteContent = (/<textarea.*>([\s\S]*)<\/textarea>/ig).exec(html)[1];
                quoteContent = addOriginalURL(url, storey, quoteContent);

                $('#post_content').val( $('#post_content').val() + quoteContent);
            }
        });
    }

}

function shortcutHandlers(evt) {
    // ALT + R 打开弹出回复框
    if (evt.altKey && evt.keyCode === 82) {
        showDialog();
    }

    // ESC 关闭回复框
    if (evt.keyCode === 27) {
        $('#reply_dialog').remove();
    }

    // CTRL + ENTER 提交回复
    if (evt.ctrlKey && evt.keyCode === 13) {
        submit();
    }

    // ALT + 0-9 快速引用
    if (evt.ctrlKey && evt.keyCode >= 48 && evt.keyCode <= 57) {

        showDialog();
        addQuoteContent(location.href, evt.keyCode-48);

        // 阻止默认快捷键
        evt.preventDefault();
        evt.stopPropagation();
        evt.ctrlKey = false;
        evt.keyCode = 0;
    }
}

_dom.addStyles(
    '#reply_dialog {' +
        'color: #222;' +
        'background-color: white;' +
        'font: 12px/1.4 ubuntu, "Lucida Grande", "Hiragino Sans GB W3", "Microsoft Yahei", sans-serif;' +
        'width: 650px;' +
        'position: fixed;' +
        'border: 5px solid transparent;' +
        'border-radius: 5px;' +
        'box-shadow: rgba(0, 0, 0, 0.4) 0 0 20px;' +
        'padding: 10px;' +
        'margin: 0 auto;' +
        'opacity: 1;' +
    '}' +
    '' +
    '#reply_dialog ul{' +
        'display: block;' +
        'list-style: none;' +
        'padding-left: 0;' +
        'margin: 0;' +
    '}' +
    '' +
    '.clearfix { clear: both; }' +
    '' +
  '.box_title {' +
        'cursor: move;' +
        'font-size: 16px;' +
        'line-height: 20px;' +
        'margin: 0 0 20px 0;' +
        'color: #0060A6;' +
        'text-align: left;' +
    '}' +
    '.close_btn {' +
        'cursor: pointer;' +
        'width: 20px;' +
        'height: 20px;' +
        'background: url("http://file.cc98.org/uploadfile/2013/8/7/1954562236.gif");' +
        'float: right;' +
    '}' +
    '.close_btn:hover { background-position: 0 -20px; }' +
    '' +
    '#reply_dialog #subject_line{' +
        'height: 20px;' +
        'margin: 10px 0;' +
    '}' +
    '#post_expression {' +
        'height: 15px;' +
        'width: 15px;' +
        'vertical-align: middle;' +
    '}' +
    '#post_subject {' +
        'margin-left: 5px;' +
        'width: 400px;' +
        'border: 1px solid #e0e0e0;' +
    '}' +
    '#post_subject:focus { outline: 1px solid #4A8CF7; }' +
    '' +
    '#editor {' +
        'margin: 0 auto;' +
        'border: 1px solid #9AC0E6;' +
        'overflow: auto;' +
    '}' +
    '' +
    '#e_control {' +
        'color: grey;' +
    '' +
        'background-color: #F1F4F8;' +
        'border-bottom: 1px solid #9AC0E6;' +
        'padding: 3px 3px 5px 3px;' +
    '}' +
    'img.e_ctrl_btn {' +
        'height: 16px;' +
        'width: 16px;' +
        'margin: 0 3px 0 0;' +
        'border: 0;' +
        'vertical-align: middle;' +
    '}' +
    '#add_attachments {' +
        'display: inline-block;' +
        'margin-left: 20px;' +
        'color: grey;' +
        'text-decoration: none;' +
        'vertical-align: middle' +
    '}' +
    '' +
    '#post_content {' +
        'border: 0;' +
        'height: 200px;' +
        'width: 100%;' +
        'padding: 5px;' +
        'box-sizing: border-box;' +
        '-moz-box-sizing: border-box;' +
        '-webkit-box-sizing: border-box;' +
    '' +
        'font: inherit;' +
        'overflow: auto;' +
        'resize: vertical;' +
        'word-wrap: break-word;' +
    '}' +
    '#post_content:focus { outline: 0px solid #9AC0E6; }' +
    '' +
    '#e_statusbar {' +
        'background-color: #f2f2f2;' +
        'border-top: 1px solid #9AC0E6;' +
    '' +
        'color: grey;' +
        'padding: 2px;' +
        'text-align: right;' +
    '}' +
    '#e_save, #e_recover {' +
        'text-decoration: none;' +
        'color: grey;' +
    '}' +
    '#e_tip {' +
        'width: 200px;' +
        'float: left;' +
        'text-align: left;' +
    '}' +
    '' +
    '' +
    '/* 一个对话框中的（末行）按钮区 */' +
    '.btn_bar {' +
        'margin: 10px 0 0 0;' +
        'width: 100%;' +
    '}' +
    '/* 标准按钮样式 */' +
    '.soda_button {' +
        'height: 20px;' +
        'width: 75px;' +
        'border: 0;' +
        'border-radius: 2px;' +
    '' +
        'cursor: pointer;' +
        'font: inherit;' +
        'color: #fff;' +
        'background-color: #6595D6;' +
        'padding: 0 0 1px; /* 用baseliner测试了一下，这样内部文字是居中的，不过我也不清楚为什么是这个数 */' +
    '}' +
    '#submitting_status {' +
        'display: inline-block;' +
        'padding-left: 20px;' +
        'text-align: left;' +
        'color: red;' +
    '' +
        'padding-bottom: 1px;  // 因为button中的文字也有1px的padding，因此，为了对齐，加了这一句' +
        'vertical-align: middle;' +
    '}' +
    '' +
    '' +
    '#attach_table {' +
        'display: none;' +
        'position:relative;' +
        'height:50px;' +
        'width: 100%;' +
        'margin-top: 10px;' +
    '' +
        'padding: 2px;' +
        'border-collapse: collapse;' +
        'overflow: visible;' +
        'text-align: left;' +
    '}' +
    '#attach_table th, #attach_table td { border: 1px solid #fff;}' +
    '#attach_table th {' +
        'color: #fff;' +
        'background-color: #6595D6;' +
        'background-image: none;' +
    '}' +
    '#attach_list > *:nth-child(even) { background-color:#ddd; }' +
    '#attach_list > *:nth-child(odd) { background-color:#eee; }' +
    '' +
    '.filename { color: #090; }' +
    '.uploadfail { color:#900; }' +
    '.uploadsuccess { color:#090; }' +
    '' +
    '#upload_panel {' +
        'position: fixed;' +
    '' +
        'border: 0px solid #ccc;' +
        'border-radius: 5px;' +
        'box-shadow: rgba(0, 0, 0, 0.4) 0 0 18px;' +
        'margin: 0 auto;' +
        'padding: 8px;' +
    '' +
        'color: #000;' +
        'background-color: #fff;' +
        'opacity: 0.8;' +
        'z-index: 200;' +
    '}' +
    '/* 上传面板的留白要比回复面板的留白稍小，故margin要覆盖定义 */' +
    '#upload_title { margin: 0 0 15px 0; }' +
    '/* 这个只是用来保证各浏览器的上传按钮宽度一样 */' +
    '#files { width: 250px; }' +
    '/* 垂直居中显示checkbox */' +
    '#image_autoshow {' +
        'margin: 0 2px 2px 0;' +
        'padding: 0;' +
        'vertical-align: middle;' +
    '}' +
    '#upload_msg {' +
        'color: red;' +
        'padding-left: 3px;' +
    '}');

// 给页面加上回复按钮
$(function() {
    // 基本界面 & 设置界面
    function addQuoteBtn() {
        quoteBtn = $('img[src="pic/reply.gif"]').parent();
        fastReplyImg = $('<img src="http://file.cc98.org/uploadfile/2013/7/17/2156264601.png">');
        fastReplyImg.css({
            "vertical-align": "middle",
            "margin-left": "5px"
        })
        fastReplyBtn = $('<a class="fastreply_btn" href="javascript:void(0);"></a>');
        fastReplyBtn.append(fastReplyImg);

        quoteBtn.parent().append(fastReplyBtn);

        $(".fastreply_btn").each(function (index, ele) {
            this.id = 'fastreply_' + index;
        });
    }

    addQuoteBtn();
})

// 绑定快捷键
$(document).keyup(shortcutHandlers);

})();
// reply button image: http://file.cc98.org/uploadfile/2013/7/17/2156264601.png

// 帖子内容保存于 01:47