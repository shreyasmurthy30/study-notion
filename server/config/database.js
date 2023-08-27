const mongoose = require("mongoose");
require("dotenv").config();

// const { MONGODB_URL } = process.env;

exports.connect = () => {
	mongoose
		.connect(process.env.DATABASE_URL, {
			useNewUrlparser: true,
			useUnifiedTopology: true,
		})
		.then(console.log(`DB Connection Success`))
		.catch((err) => {
			console.log(`DB Connection Failed`);
			console.log(err);
			process.exit(1);
		});
};
