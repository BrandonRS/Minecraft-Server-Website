const GOOD = 200, BAD = 400;
var socket;

$(function() {
    socket = io.connect('https://cleft.fun', { path: '/minecraft/socket.io' });

    socket.on('message', data => {
        console.log(data);
    });

    socket.on('log', data => {
        $('#log').append($('<tr>').text(data));
    });

    $("form").ajaxForm({
        beforeSend: function() {
            $("#startServerForm").find("input").prop('disabled', true);
            $("#uploadProgress").css('width', '0%');
            $('#uploadProgress').text('0%');
        },
        uploadProgress: function(e, position, total, complete) {
            $("#uploadProgress").css('width', complete + '%');
            $('#uploadProgress').text(complete + "%");
        },
        success: function(res) {
            $("#startServerForm").find("input").prop('disabled', false);
            if (res.status == GOOD) {
                showSuccess("Server successfully started!");
                updateStatusText();
                $('#log').html('');
            } else {
                showError("Failed to start server: " + res.message);
            }
        }
    });

    updateStatusText();
    getProperties($('#version').val());

    $('#log').val('');
});

function showSuccess(text) {
    new Noty({
        type: 'success',
        timeout: 4000,
        text: text
    }).show();
}

function showError(text) {
    new Noty({
        type: 'error',
        timeout: 4000,
        text: text
    }).show();
}

$('#submit').click(function(e) {
    e.preventDefault();
    getServerStatus(function(res) {
        if (res.status == GOOD && !res.isUp) {
            var properties = {};
            $('#tbodyProp').children().each(function() {
                var val = $(this).children('td').children('input').val();
                properties[$(this).children('th').text()] = val === '' ? null : val;
            });

            $('#inputProp').val(JSON.stringify(properties));
            
            // Submit form
            $('#startServerForm').submit();
        } else {
            $('#submit').prop('disabled', false);
            showError("Failed to start server: Server already running.");
        }
    });
});

$('#version').change(function() {
    getProperties($(this).val());
});

$("#stopServer").click(function() {
    $("#serverControl").find().prop("disabled", true);
    $.post("/minecraft/stop")
    .done(function(res) {
        $("#serverControl").find().prop("disabled", false);
        if (res.status == GOOD) {
            showSuccess("Server successfully stopped!");
            updateStatusText();
        }
        else
            showError("Failed to stop server: " + res.message);
    });
});

$('#sendCommand').click(function() {
    getServerStatus(function(res) {
        if (res.status == GOOD && res.isUp) {
            $('#sendCommand').prop('disabled', true);
            $.post('/minecraft/command', {command: $('#command').val()})
            .done(function(res) {
                $('#command').val('');
                $('#sendCommand').prop('disabled', false);
                if (res.status == GOOD)
                    showSuccess('Command successfully sent!');
                else
                    showError(res.message);
            });
        }
        else
            showError('Server not up.');
    });
});

function updateStatusText() {
    getServerStatus(function(res) {
        $("#serverControl").find('input').prop("disabled", false);
        if (res.status == GOOD && res.isUp) {
            $("#statusText").text("Server is up!");
            $('#currentMapName').text(`Current map: ${res.currentMap}`);
            $('#currentVersion').text(`Version: ${res.version}`);
        } else {
            $('#statusText').text('Server is down!');
            $('#currentMapName').text('');
            $('#currentVersion').text('');
        }
    });
};

function getServerStatus(callback) {
    $("#serverControl").find('input').prop("disabled", true);
    $.get('/minecraft/status')
    .done(callback);
}

function getProperties(version) {
    $.get('/minecraft/properties', {'version': version})
    .done(function(res) {
        if (res.status == GOOD) {
            // Delete old table cells
            $('#tbodyProp').html("");

            Object.keys(res.properties).sort().forEach(k => {
                var row = $('<tr>');
                row.append($('<th>').text(k));

                var button = $('<input type="button" class="cell-button">');
                button.val(res.properties[k] == null ? '' : res.properties[k]);
                button.click(function() {
                    var val = $(this).val().toLowerCase();
                    if (val === "true" || val === "false")
                        bootbox.prompt({
                            title: `Enter new value for ${$(this).parent().siblings().text()}:`,
                            inputType: 'radio',
                            value: val,
                            inputOptions: [
                                {text: "True", value: "true"},
                                {text: "False", value: "false"}
                            ],
                            callback: function(result) {
                                if (result)
                                    button.val(result);
                            }
                        });
                    else
                        bootbox.prompt({
                            title: `Enter new value for ${$(this).parent().siblings().text()}:`,
                            placeholder: val,
                            callback: function(result) {
                                if (result != null)
                                    button.val(result);
                            }
                        });
                });
                row.append($('<td class="align-middle">').append(button));
                $('#tbodyProp').append(row);
            });
        }
    });
}

$("#checkStatus").click(function() {
    getServerStatus();
});