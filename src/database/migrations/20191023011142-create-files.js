module.exports = {
  // Metodo up, que é quando a migration for executada
  up: (queryInterface, Sequelize) => {
    return queryInterface.createTable('files', {
      // Neste segundo objeto vai ser definido os campos da tabela
      // Passado objeto para as colunas, devido ter que passar configurações a mais
      id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
      },
      name: {
        type: Sequelize.STRING,
        allowNull: false,
      },
      path: {
        type: Sequelize.STRING,
        allowNull: false,
        unique: true,
      },
      // O sequelize vai preencher estes dois campos automaticamente
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
      },
    });
  },

  // Metodo down, se for fazer o rollback, já esta configurado
  // Removido o sequelize, que não vai ser usado no metodo down
  // _down: (queryInterface, Sequelize) => {
  down: queryInterface => {
    return queryInterface.dropTable('files');
  },
};
