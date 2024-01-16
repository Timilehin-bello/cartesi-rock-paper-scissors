const axios = require('axios');
const crypto = require('crypto');
const { env } = require('process');
const winston = require('winston');

// Configure logger
const logger = winston.createLogger({
    level: 'info',
    format: winston.format.simple(),
    transports: [
        new winston.transports.Console()
    ],
});

const rollupServer = env.ROLLUP_HTTP_SERVER_URL;
logger.info(`HTTP rollup_server url is ${rollupServer}`);

function handleAdvance(data) {
    logger.info(`Received advance request data ${JSON.stringify(data)}`);

    let status = "accept";
    try {
        const moves = ["rock", "paper", "scissors"];
        const computerMove = moves[Math.floor(Math.random() * moves.length)];

        const playerMove = hex2str(data.payload);
        logger.info(`Received input: ${playerMove}`);

        // Determine the result of the game
        const result = determineWinner(playerMove, computerMove);

        // Send the result as a notice
        logger.info(`Adding notice with payload: '${result}'`);
        axios.post(`${rollupServer}/notice`, { payload: str2hex(result) })
            .then(response => {
                logger.info(`Received notice status ${response.status} body ${response.data}`);
            })
            .catch(error => {
                logger.error(`Error: ${error}`);
            });
    } catch (error) {
        status = "reject";
        const msg = `Error processing data ${JSON.stringify(data)}\n${error.stack}`;
        logger.error(msg);
        axios.post(`${rollupServer}/report`, { payload: str2hex(msg) })
            .then(response => {
                logger.info(`Received report status ${response.status} body ${response.data}`);
            })
            .catch(err => {
                logger.error(`Error: ${err}`);
            });
    }

    return status;
}

function hex2str(hexString) {
    return Buffer.from(hexString.slice(2), 'hex').toString('utf8');
}

function str2hex(regularString) {
    return '0x' + Buffer.from(regularString, 'utf8').toString('hex');
}

function determineWinner(playerMove, computerMove) {
    if (playerMove === computerMove) {
        return "It's a tie!";
    } else if ((playerMove === "rock" && computerMove === "scissors") ||
               (playerMove === "scissors" && computerMove === "paper") ||
               (playerMove === "paper" && computerMove === "rock")) {
        return "You win!";
    } else {
        return "You lose!";
    }
}

function handleInspect(data) {
    logger.info(`Received inspect request data ${JSON.stringify(data)}`);
    logger.info("Adding report");
    axios.post(`${rollupServer}/report`, { payload: data.payload })
        .then(response => {
            logger.info(`Received report status ${response.status}`);
        })
        .catch(err => {
            logger.error(`Error: ${err}`);
        });

    return "accept";
}

const handlers = {
    "advance_state": handleAdvance,
    "inspect_state": handleInspect,
};

const finish = { status: "accept" };

async function main() {
    while (true) {
        logger.info("Sending finish");
        try {
            const response = await axios.post(`${rollupServer}/finish`, finish);
            logger.info(`Received finish status ${response.status}`);

            if (response.status === 202) {
                logger.info("No pending rollup request, trying again");
            } else {
                const rollupRequest = response.data;
                const handler = handlers[rollupRequest.request_type];
                finish.status = handler(rollupRequest.data);
            }
        } catch (error) {
            logger.error(`Error: ${error}`);
        }
    }
}

main();
