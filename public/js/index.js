const GOOD = 200, BAD = 400;
const basicSettings = [
    'difficulty',
    'enable-command-block',
    'gamemode',
    'max-players',
    'motd',
    'pvp',
    'server-port'
];

var socket;
var properties = {};
var basicMode = true;

$(function() {
    socket = io.connect(hostname, { path: `${prefix}/socket.io` });

    socket.on('log', data => {
        $('#log').append($('<tr>').text(data));
    });

    $("#startServerForm").ajaxForm({
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
    // Make sure file is selected
    if ($("#mapUpload").val().length > 0) {
        getServerStatus((res) => {
            if (res.status == GOOD && !res.isUp) {
                saveProperties();
    
                $('#inputProp').val(JSON.stringify(properties));
                
                // Submit form
                $('#startServerForm').prop('action', `${prefix}/upload`);
                $('#startServerForm').submit();
            } else {
                $('#submit').prop('disabled', false);
                showError("Failed to start server: Server already running.");
            }
        });
    } else if ($("#mapLink").val().length > 0) {
        getServerStatus((res) => {
            if (res.status == GOOD && !res.isUp) {
                saveProperties();
    
                $('#inputProp').val(JSON.stringify(properties));
                
                // Submit form
                $('#startServerForm').prop('action', `${prefix}/uploadlink`);
                $('#startServerForm').submit();
            } else {
                $('#submit').prop('disabled', false);
                showError("Failed to start server: Server already running.");
            }
        });
    } else {
        showError("Error: Please select file to upload.");
    }
});

$('#version').change(function() {
    getProperties($(this).val());
});

function saveProperties() {
    $('#tbodyProp').children().each(function() {
        var val = $(this).children('td').children('input').val();
        properties[$(this).children('th').text()] = val === '' ? null : val;
    });
}

$("#stopServer").click(function() {
    $("#serverControl").find('input').prop("disabled", true);
    $.post(`${prefix}/stop`)
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
            $.post(`${prefix}/command`, {command: $('#command').val()})
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
    $.get(`${prefix}/status`)
    .done(callback);
}

function getProperties(version) {
    var n = new Noty({
        type: 'info',
        timeout: false,
        text: "Retrieving properties...",
        closeWith: []
    });
    n.show();

    $("#version").prop('disabled', 'disabled');
    $("#propertiesOverlay").show();
    $.get(`${prefix}/properties`, {'version': version})
    .done((res) => {
        n.close();
        if (res.status == GOOD) {
            properties = res.properties;
        } else {
            properties = {};
            showError("Failed to retrieve properties.");
        }
        loadProperties();
        $("#propertiesOverlay").hide();
        $("#version").prop('disabled', false);
    });
}

function loadProperties() {
    saveProperties();
    $('#tbodyProp').html("");

    Object.keys(properties).sort().forEach(k => {
        if (!basicMode || basicSettings.includes(k)) {
            var row = $('<tr>');
            row.append($('<th>').text(k));

            var button = $('<input type="button" class="cell-button">');
            button.val(properties[k] == null ? '' : properties[k]);
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
        }
    });
}

$("#buttonBasic").click(() => {
    if (!basicMode) {
        $('#pageBasic').toggleClass('active');
        $('#pageAdvanced').toggleClass('active');
        basicMode = true;
        loadProperties();
    }
});

$('#buttonAdvanced').click(() => {
    if (basicMode) {
        $('#pageBasic').toggleClass('active');
        $('#pageAdvanced').toggleClass('active');
        basicMode = false;
        loadProperties();
    }
});

$("#checkStatus").click(function() {
    getServerStatus();
});