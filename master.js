/**
 * Created by kyriosli on 2014/5/20.
 *
 */

Uint32Array.prototype.toJSON = function () {
    return Array.prototype.slice.call(this);
};

var esprima = require('./esprima');

var coverNodeModules = process.env.cov_all , coverDepth = 0;
if (coverNodeModules) {
    if (/^\d+$/.test(coverNodeModules)) {
        coverDepth = +coverNodeModules;
        coverNodeModules = false;
    } else {
        coverNodeModules = true;
    }
} else {
    coverNodeModules = false;
}

// Current coverage information
var files = {};

exports.requestHandler = function (req, res) {
    res.end(JSON.stringify(files));
};

var Module = require('module');
var $_compile = Module.prototype._compile;
Module.prototype._compile = function (content, filename) {
    var m;
    switch (true) {
        case coverNodeModules:
        case filename.indexOf('node_modules') === -1:
        case coverDepth && (m = filename.match(/([\/\\])node_modules\1/g)) && m.length <= coverDepth:
            content = addCoverage(this, filename, content);
    }
    $_compile.call(this, content, filename);
};


function addCoverage(module, filename, content) {
    // remove shebang
    content = content.replace(/^\#\!.*/, '');

    var parsed = esprima.parse('function it(){' + content + '\n}', {range: true, loc: true});

    var arr = [], stack = [], point, useComma = false, covered = [];
    var blocks = [parsed.body[0].body], block;
    while (block = blocks.shift()) {
//        console.log('parsing block ' + block.loc.start.line);
        block.body.forEach(onStmt);
    }
//    console.log('points: ', arr);
    var newContent = 'var _cov$=module.coverage_cache;', pos = 0, line = -1;
    arr.forEach(function (cc) {
        var newPoint = cc.point - 14, newLine = cc.line;
        if (newPoint === pos && newLine === line) return;
        if (newPoint < pos) {
//            console.log('bad point: ' + newPoint + ':' + content.substr(newPoint, 20) + '\n' + pos + ':' + content.substr(pos, 20));
            throw 1;
        }
        newContent += content.substring(pos, newPoint) + cc.value;
        pos = newPoint;
        if (newLine !== -1)
            line = newLine;
    });
    newContent += content.substr(pos);

//    console.error('//' + filename + '\n', '(function(exports, require, module, __filename, __dirname) {' + newContent + '\n})' + '();');
    var lines = 0;
    for (var j = line + 1; j--;) {
        if (covered[j]) {
            lines++;
        }
    }

    files[filename] = {
        src: content,
        coverage: module.coverage_cache = new Uint32Array(line + 1),
        lines: lines
    };
    return newContent;

    function onStmt(stmt) {
        if (!stmt)
            return;
//        console.log('----->', stmt);
        stack.push(point);
        point = stmt.range[0];

        var line = stmt.loc.start.line;

        switch (stmt.type) {
            case 'VariableDeclaration':
                // add coverage before 'var' keyword
                stmt.declarations.forEach(onExpr);
                break;
            case 'FunctionDeclaration':
                addCov(line, true);
                point = stmt.range[0];
                blocks.push(stmt.body);
//                stmt.body.body.forEach(onStmt);
                break;
            case 'ExpressionStatement':
                onExpr(stmt.expression);
                break;
            case 'IfStatement':
                onExpr(stmt.test);
                testBlock(stmt.consequent);
                testBlock(stmt.alternate);
                break;
            case 'ForStatement':
                testVar(stmt.init);
                useComma = true;
                if (stmt.test) {
                    stack.push(point);
                    point = stmt.test.range[0];
                    onExpr(stmt.test);
                    point = stack.pop();
                }
                if (stmt.update) {
                    stack.push(point);
                    point = stmt.update.range[0];
                    onExpr(stmt.update);
                    point = stack.pop();
                }
                useComma = false;
                testBlock(stmt.body);
                break;
            case 'BreakStatement':
                addCov(line);
                break;
            case 'ForInStatement':
                testVar(stmt.left);
                onExpr(stmt.right);
                testBlock(stmt.body);
                break;
            case 'WhileStatement':
                // adds before stmt
                addCov(line);
                testBlock(stmt.body);
                break;
            case 'DoWhileStatement':
//                console.log(stmt);
                testBlock(stmt.body);
                point = stmt.range[1];
                addCov(stmt.loc.end.line);
                break;
            case 'ReturnStatement':
                addCov(line);
                onExpr(stmt.argument);
                break;
            case 'BlockStatement':
                stmt.body.forEach(onStmt);
                break;
            case 'SwitchStatement':
                onExpr(stmt.discriminant);
                stmt.cases.forEach(function (_case) {
                    stack.push(point);
                    point = _case.range[0] + 5;
                    useComma = true;
                    onExpr(_case.test);
                    useComma = false;
                    point = stack.pop();
                    _case.consequent.forEach(onStmt);
                });
                break;
            case 'TryStatement':
                stmt.block.body.forEach(onStmt);
                if (stmt.handlers.length) {
                    stmt.handlers[0].body.body.forEach(onStmt);
                }
                if (stmt.finalizer) {
                    stmt.finalizer.body.forEach(onStmt);
                }
                break;
            case 'ThrowStatement':
//                console.log(stmt);
                stack.push(point);
                point = stmt.argument.range[0];
                useComma = true;
                addCov(line);
                onExpr(stmt.argument);
                useComma = false;
                point = stack.pop();
                break;
        }

        point = stack.pop();
    }

    function testVar(stmt) {
        if (stmt) {
            if (stmt.type === 'VariableDeclaration') {
                stmt.declarations.forEach(onExpr);
            } else {
                onExpr(stmt);
            }
        }
    }

    function testBlock(stmt) {
        if (stmt) {
            if (stmt.type === 'BlockStatement') {
                stmt.body.forEach(onStmt);
            } else {
                push({point: stmt.range[0], line: -1, value: '{'});
                onStmt(stmt);
//                console.log('***** ', content.substring(stmt.range[0], stmt.range[1]), '*****', stmt);
                push({point: stmt.range[1], line: -1, value: '}'});
            }
        }
    }

    function addCov(line, atBeginning) {
        line--;
        covered[line] = true;
        push({point: atBeginning ? block.range[0] + 1 : point, line: line, value: '++_cov$[' + line + ']' + (useComma ? ',' : ';')});
    }

    function push(obj) {
        var point = obj.point;
        for (var L = arr.length, i = L; i-- && arr[i].point > point;) ;
        i++;
        if (i === L)
            arr.push(obj);
        else
            arr.splice(i, 0, obj);
    }

    function onExpr(expr) {
        if (!expr) // empty expression
            return;
//        console.log('\\\\\\ ' + content.substring(expr.range[0], expr.range[1]) + ' ///', expr);
        addCov(expr.loc.start.line);
        switch (expr.type) {
            case 'VariableDeclarator':
                // 对变量声明，遍历其初始化表达式
                onExpr(expr.init);
                break;
            case 'MemberExpression':
                // 对象成员访问，遍历其对象object和property
                onExpr(expr.object, point);
                onExpr(expr.property, point);
                break;
            case 'UnaryExpression':
                onExpr(expr.argument);
                break;
            case 'AssignmentExpression':
                onExpr(expr.left);
                onExpr(expr.right);
                break;
            case  'BinaryExpression':
                onExpr(expr.left);
                onExpr(expr.right);
                break;
            case 'ConditionalExpression':
                onExpr(expr.test);
                onExpr(expr.consequent);
                onExpr(expr.alternate);
                break;
            case 'CallExpression':
                // 对函数调用，遍历其callee和arguments
                onExpr(expr.callee);
                expr.arguments.forEach(onExpr);
                break;
            case 'FunctionExpression':
                // 对函数表达式，遍历其函数体
                // save/restore useComma
                stack.push(useComma);
                useComma = false;
                blocks.push(expr.body);
                useComma = stack.pop();
                break;
            case 'ObjectExpression':
                // 对对象初始化，遍历其properties
                expr.properties.forEach(function (prop) {
                    onExpr(prop.value)
                });
                break;
            case 'ArrayExpression':
                // 对数组初始化，遍历其elements
                expr.elements.forEach(onExpr);
                break;
            case 'SequenceExpression':
                stack.push(point);
                useComma = true;
                expr.expressions.forEach(function (expr) {
                    point = expr.range[0];
                    onExpr(expr);
                });
                useComma = false;
                point = stack.pop();
                break;
        }

    }
};

