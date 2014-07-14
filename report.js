(function () {
    var hashes = {};

    function hash(file) {
        file = file.substr(file.lastIndexOf('/') + 1);

        if (hashes[file]) {
            file += ':';
            for (var i = 0, name; ; i++) {
                if (!hashes[name = file + i]) {
                    file = name;
                    break;
                }
            }
        }
        hashes[file] = 1;
        return file;
    }

    var xhr = new XMLHttpRequest();
    xhr.open('GET', 'files?' + location.hash.substr(1));
    xhr.send();
    xhr.onload = function () {
        var files = JSON.parse(xhr.responseText),
            fileNames = Object.keys(files);
        var preLen = fileNames[0].lastIndexOf('/') + 1, pre = fileNames[0].substr(0, preLen);
        fileNames.forEach(function (fileName) {
            while (fileName.substr(0, preLen) !== pre) {
                pre = pre.substr(0, --preLen);
            }
        });

        var sumCov = 0, sumCount = 0;

        var menuHTML = '';
        var fieldSets = fileNames.map(function (fileName) {
            var obj = files[fileName];
            var shortName = fileName.substr(preLen);
            var id = hash(shortName);


            var lines = obj.src.split(/\r?\n/), count = lines.length, cov = obj.coverage;
            var covered = 0;

            lines = lines.map(function (line, i) {
                if (cov[i] || !line.trim())
                    covered++;
                return '<li class="' + (cov[i] ? 'covered' : '')
                    + '"><i>' + (i + 1) + '</i><span>' + line + '</span></li>'
            }).join('');

            sumCov += covered;
            sumCount += count;


            var rate = (covered / count * 1e4 << 0) / 100;
            menuHTML += '<li><input type="checkbox" checked data-covered="' + covered
                + '" data-count="' + count + '"><a href="#' + id + '" title="' + fileName + '">' + shortName + '</a>(' + rate + '%)</li>';

            return '<fieldset id="' + id + '"><legend>' + shortName
                + ': ' + rate + '%(' + covered + '/' + count
                + ')</legend><ul>' + lines + '</ul></fieldset>';
        }).join('');


        document.body.innerHTML = '<menu><li>total: '
            + (sumCov / sumCount * 1e4 << 0) / 100 + '% (' + sumCov + '/' + sumCount + ')</li>'
            + menuHTML + '</menu>' + fieldSets;
        document.querySelector('menu').addEventListener('change', function (e) {
            var input = e.target,
                cov = +input.getAttribute('data-covered'),
                count = +input.getAttribute('data-count');
            if (input.checked) {
                sumCov += cov;
                sumCount += count;
            } else {
                sumCov -= cov;
                sumCount -= count;
            }
            document.getElementById(input.nextElementSibling.getAttribute('href').substr(1)).style.display = input.checked ? '' : 'none';
            input.parentNode.parentNode.firstElementChild.innerHTML = 'total: ' + (sumCov / sumCount * 1e4 << 0) / 100 + '% (' + sumCov + '/' + sumCount + ')';
        }, true);
    }
})();